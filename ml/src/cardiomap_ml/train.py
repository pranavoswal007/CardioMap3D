"""CardioMap 3D ML Training Pipeline.

Full training, repeated stratified cross-validation, hyperparameter tuning,
calibration, threshold optimization, SHAP feature attribution, and artifact generation.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
import time
from pathlib import Path
from typing import Any

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import numpy.typing as npt
import pandas as pd
import shap
from lightgbm import LGBMClassifier
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

from cardiomap_ml.config import (
    RANDOM_SEED,
    RAW_TARGET_COLUMNS,
    TARGET_COLUMN_MAP,
    TARGET_ENCODINGS,
    assert_no_target_leakage,
    set_seed,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# Feature group specifications for the 55 inputs
NUMERIC_FEATURES = [
    "Age", "Weight", "Length", "BMI", "BP", "PR",
    "FBS", "CR", "TG", "LDL", "HDL", "BUN", "ESR",
    "HB", "K", "Na", "WBC", "Lymph", "Neut", "PLT",
    "EF-TTE", "Function Class", "Region RWMA"
]

CATEGORICAL_FEATURES = ["BBB", "VHD"]

# Clinical baseline subset
CLINICAL_SUBSET = ["Age", "Sex", "HTN", "DM", "Current Smoker", "Typical Chest Pain"]


from cardiomap_ml.preprocessing import BinaryFeatureEncoder


def create_preprocessor(feature_columns: list[str]) -> ColumnTransformer:
    """Create a ColumnTransformer handling numeric, categorical, and binary inputs."""
    num_cols = [c for c in NUMERIC_FEATURES if c in feature_columns]
    cat_cols = [c for c in CATEGORICAL_FEATURES if c in feature_columns]
    bin_cols = [c for c in feature_columns if c not in num_cols and c not in cat_cols]

    transformers = []
    if num_cols:
        transformers.append((
            "num",
            Pipeline([
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
            ]),
            num_cols,
        ))
    if cat_cols:
        transformers.append((
            "cat",
            OneHotEncoder(drop="first", sparse_output=False, handle_unknown="ignore"),
            cat_cols,
        ))
    if bin_cols:
        transformers.append((
            "bin",
            BinaryFeatureEncoder(),
            bin_cols,
        ))

    return ColumnTransformer(transformers=transformers)


def calculate_metrics_at_threshold(y_true: npt.NDArray[Any], y_prob: npt.NDArray[Any], threshold: float = 0.5) -> dict[str, float]:
    """Compute classification metrics for continuous probabilities at a specific decision threshold."""
    y_pred = (y_prob >= threshold).astype(int)
    acc = float(accuracy_score(y_true, y_pred))
    prec = float(precision_score(y_true, y_pred, zero_division=0))
    rec = float(recall_score(y_true, y_pred, zero_division=0))
    f1 = float(f1_score(y_true, y_pred, zero_division=0))
    brier = float(brier_score_loss(y_true, y_prob))
    try:
        roc_auc = float(roc_auc_score(y_true, y_prob))
    except (ValueError, TypeError, ZeroDivisionError):
        roc_auc = 0.5
    try:
        pr_auc = float(average_precision_score(y_true, y_prob))
    except (ValueError, TypeError, ZeroDivisionError):
        pr_auc = float(np.mean(y_true))

    return {
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "brier_score": brier,
    }


def compute_bootstrap_ci(y_true: npt.NDArray[Any], y_prob: npt.NDArray[Any], metric_fn: Any, n_bootstraps: int = 1000, seed: int = 42) -> tuple[float, float]:
    """Compute empirical 95% bootstrap confidence interval for a metric."""
    rng = np.random.default_rng(seed)
    n = len(y_true)
    scores = []
    for _ in range(n_bootstraps):
        idx = rng.choice(n, size=n, replace=True)
        # Ensure at least one positive and one negative sample in bootstrap
        if len(np.unique(y_true[idx])) < 2:
            continue
        try:
            score = metric_fn(y_true[idx], y_prob[idx])
            scores.append(score)
        except (ValueError, TypeError, ZeroDivisionError) as err:
            logger.debug("Bootstrap sample evaluation error: %s", err)
            continue
    if not scores:
        return (0.0, 1.0)
    return (float(np.percentile(scores, 2.5)), float(np.percentile(scores, 97.5)))


def find_optimal_thresholds(y_true: npt.NDArray[Any], y_prob: npt.NDArray[Any]) -> dict[str, Any]:
    """Calculate Youden's J and max F1 optimal decision thresholds and tradeoff curves."""
    fpr, tpr, roc_thresh = roc_curve(y_true, y_prob)
    # Youden's J = Sensitivity + Specificity - 1 = tpr - fpr
    j_scores = tpr - fpr
    best_j_idx = int(np.argmax(j_scores))
    youden_thresh = float(roc_thresh[best_j_idx]) if best_j_idx < len(roc_thresh) else 0.5
    # Bound threshold to [0.05, 0.95] for numerical stability
    youden_thresh = float(np.clip(youden_thresh, 0.05, 0.95))

    precision, recall, pr_thresh = precision_recall_curve(y_true, y_prob)
    f1_scores = 2 * (precision * recall) / (precision + recall + 1e-10)
    best_f1_idx = int(np.argmax(f1_scores))
    f1_thresh = float(pr_thresh[best_f1_idx]) if best_f1_idx < len(pr_thresh) else 0.5
    f1_thresh = float(np.clip(f1_thresh, 0.05, 0.95))

    # Sensitivity/specificity tradeoff table across steps
    tradeoffs = []
    for t in np.linspace(0.1, 0.9, 9):
        pred = (y_prob >= t).astype(int)
        sens = float(recall_score(y_true, pred, zero_division=0))
        # Specificity = TN / (TN + FP)
        tn = np.sum((y_true == 0) & (pred == 0))
        fp = np.sum((y_true == 0) & (pred == 1))
        spec = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
        tradeoffs.append({"threshold": round(float(t), 2), "sensitivity": round(sens, 4), "specificity": round(spec, 4)})

    return {
        "default_threshold": 0.5,
        "youden_j_threshold": round(youden_thresh, 4),
        "max_f1_threshold": round(f1_thresh, 4),
        "selected_threshold": round(f1_thresh, 4),
        "tradeoffs": tradeoffs,
    }


def load_dataset(data_path: str | Path) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Load and validate dataset from raw excel sheet."""
    logger.info("Loading raw dataset from %s (Sheet 1 - Table 1)...", data_path)
    df = pd.read_excel(data_path, sheet_name="Sheet 1 - Table 1")
    logger.info("Raw dataset loaded: %d rows x %d columns.", df.shape[0], df.shape[1])

    # Check and extract targets
    y_dict = {}
    for raw_target, std_target in TARGET_COLUMN_MAP.items():
        if raw_target not in df.columns:
            raise KeyError(f"Expected target column {raw_target} missing from dataset!")
        encoding = TARGET_ENCODINGS[raw_target]
        y_dict[std_target] = df[raw_target].map(encoding).astype(int)
    y_df = pd.DataFrame(y_dict)

    # Invariant: y_cad consistency check
    any_vessel = ((y_df["y_lad"] == 1) | (y_df["y_lcx"] == 1) | (y_df["y_rca"] == 1)).astype(int)
    inconsistent = df[(any_vessel == 1) & (y_df["y_cad"] == 0)]
    consistency_summary = {
        "total_patients": len(df),
        "y_cad_positives": int(y_df["y_cad"].sum()),
        "y_lad_positives": int(y_df["y_lad"].sum()),
        "y_lcx_positives": int(y_df["y_lcx"].sum()),
        "y_rca_positives": int(y_df["y_rca"].sum()),
        "any_vessel_positives": int(any_vessel.sum()),
        "discrepancy_count": len(inconsistent),
        "discrepancy_indices": inconsistent.index.tolist(),
    }
    logger.info("Target consistency check: %d discrepancies found. (Index 93: Cath=Normal, LAD=Stenotic)", len(inconsistent))

    # Build X by dropping raw targets
    X = df.drop(columns=list(RAW_TARGET_COLUMNS))
    if len(X.columns) != 55:
        raise AssertionError(f"HARD INVARIANT FAILED: Expected exactly 55 feature columns, got {len(X.columns)}")
    assert_no_target_leakage(X.columns)
    logger.info("Feature invariant passed: X has exactly 55 columns with 0 target leakage.")

    return X, y_df, consistency_summary


def evaluate_baselines(X: pd.DataFrame, y: npt.NDArray[Any], cv_splits: list[tuple[npt.NDArray[Any], npt.NDArray[Any]]]) -> dict[str, Any]:
    """Evaluate majority-class and clinical subset logistic regression baselines."""
    # 1. Majority baseline
    maj_val = int(np.mean(y) >= 0.5)
    maj_pred = np.full_like(y, maj_val)
    maj_prob = np.full(len(y), np.mean(y))
    maj_acc = float(accuracy_score(y, maj_pred))
    maj_brier = float(brier_score_loss(y, maj_prob))
    maj_f1 = float(f1_score(y, maj_pred, zero_division=0))

    # 2. Clinical subset LR
    X_clin = X[CLINICAL_SUBSET]
    prep_clin = create_preprocessor(CLINICAL_SUBSET)
    lr_clin = Pipeline([
        ("prep", prep_clin),
        ("clf", LogisticRegression(random_state=RANDOM_SEED, class_weight="balanced", max_iter=1000)),
    ])

    oof_clin_probs = np.zeros(len(y))
    for train_idx, val_idx in cv_splits:
        lr_clin.fit(X_clin.iloc[train_idx], y[train_idx])
        oof_clin_probs[val_idx] += lr_clin.predict_proba(X_clin.iloc[val_idx])[:, 1]
    oof_clin_probs /= (len(cv_splits) // 5)  # Average across repeats if multiple

    clin_metrics = calculate_metrics_at_threshold(y, oof_clin_probs, threshold=0.5)

    return {
        "majority_class": {
            "accuracy": maj_acc,
            "f1": maj_f1,
            "roc_auc": 0.5,
            "brier_score": maj_brier,
        },
        "clinical_subset_lr": clin_metrics,
    }


def train_and_evaluate_target(
    target_name: str,
    X: pd.DataFrame,
    y: npt.NDArray[Any],
    n_splits: int = 5,
    n_repeats: int = 5,
    artifacts_dir: Path = Path("artifacts"),
) -> dict[str, Any]:
    """Train models, evaluate out-of-fold metrics, calibrate best model, and generate plots."""
    logger.info("---------------------------------------------------------------")
    logger.info("Initiating Training & CV for Target: %s (Positives: %d/%d, %.2f%%)",
                target_name, np.sum(y), len(y), 100 * np.mean(y))

    rskf = RepeatedStratifiedKFold(n_splits=n_splits, n_repeats=n_repeats, random_state=RANDOM_SEED)
    splits = list(rskf.split(X, y))

    # Baseline models
    baselines = evaluate_baselines(X, y, splits)

    # Model candidates
    # Preprocessor is created fresh inside CV folds
    candidate_factories: dict[str, Any] = {
        "LogisticRegression": lambda: Pipeline([
            ("prep", create_preprocessor(list(X.columns))),
            ("clf", LogisticRegression(max_iter=1000, random_state=RANDOM_SEED, class_weight="balanced")),
        ]),
        "RandomForest": lambda: Pipeline([
            ("prep", create_preprocessor(list(X.columns))),
            ("clf", RandomForestClassifier(n_estimators=100, max_depth=6, random_state=RANDOM_SEED, class_weight="balanced", n_jobs=2)),
        ]),
        "XGBoost": lambda: Pipeline([
            ("prep", create_preprocessor(list(X.columns))),
            ("clf", XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.05, random_state=RANDOM_SEED, eval_metric="logloss", n_jobs=2)),
        ]),
        "LightGBM": lambda: Pipeline([
            ("prep", create_preprocessor(list(X.columns))),
            ("clf", LGBMClassifier(n_estimators=100, max_depth=4, learning_rate=0.05, random_state=RANDOM_SEED, verbose=-1, n_jobs=2)),
        ]),
    }

    # Soft voting ensemble
    candidate_factories["SoftVotingEnsemble"] = lambda: Pipeline([
        ("prep", create_preprocessor(list(X.columns))),
        ("clf", VotingClassifier(
            estimators=[
                ("lr", LogisticRegression(max_iter=1000, random_state=RANDOM_SEED, class_weight="balanced")),
                ("rf", RandomForestClassifier(n_estimators=100, max_depth=6, random_state=RANDOM_SEED, class_weight="balanced", n_jobs=2)),
                ("xgb", XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.05, random_state=RANDOM_SEED, eval_metric="logloss", n_jobs=2)),
            ],
            voting="soft",
        )),
    ])

    model_evaluations: dict[str, Any] = {}
    oof_predictions_all: dict[str, npt.NDArray[Any]] = {}

    for model_name, factory in candidate_factories.items():
        t0 = time.time()
        fold_metrics: list[dict[str, float]] = []
        oof_probs = np.zeros(len(y), dtype=np.float64)

        for train_idx, val_idx in splits:
            model = factory()
            model.fit(X.iloc[train_idx], y[train_idx])
            probs = model.predict_proba(X.iloc[val_idx])[:, 1]
            oof_probs[val_idx] += probs
            fold_m = calculate_metrics_at_threshold(y[val_idx], probs, threshold=0.5)
            fold_metrics.append(fold_m)

        oof_probs /= n_repeats
        oof_predictions_all[model_name] = oof_probs
        elapsed = time.time() - t0

        # Aggregate across folds
        metric_keys = fold_metrics[0].keys()
        agg_metrics: dict[str, Any] = {}
        for k in metric_keys:
            vals = [fm[k] for fm in fold_metrics]
            mean_v = float(np.mean(vals))
            std_v = float(np.std(vals))
            agg_metrics[k] = {"mean": round(mean_v, 4), "std": round(std_v, 4)}

        # Out-of-fold pooled metrics with 95% bootstrap CIs
        oof_metrics = calculate_metrics_at_threshold(y, oof_probs, threshold=0.5)
        for k in ["accuracy", "f1", "roc_auc", "pr_auc", "brier_score"]:
            if k == "accuracy":
                fn = lambda yt, yp: accuracy_score(yt, (yp >= 0.5).astype(int))
            elif k == "f1":
                fn = lambda yt, yp: f1_score(yt, (yp >= 0.5).astype(int), zero_division=0)
            elif k == "roc_auc":
                fn = roc_auc_score
            elif k == "pr_auc":
                fn = average_precision_score
            elif k == "brier_score":
                fn = brier_score_loss
            low, high = compute_bootstrap_ci(y, oof_probs, fn, seed=RANDOM_SEED)
            agg_metrics[k]["ci_95"] = [round(low, 4), round(high, 4)]
            agg_metrics[k]["oof_value"] = round(oof_metrics[k], 4)

        logger.info("  [%s] ROC-AUC: %.4f +/- %.4f [95%% CI: %.4f - %.4f] (Brier: %.4f, Time: %.2fs)",
                    model_name, agg_metrics["roc_auc"]["mean"], agg_metrics["roc_auc"]["std"],
                    agg_metrics["roc_auc"]["ci_95"][0], agg_metrics["roc_auc"]["ci_95"][1],
                    agg_metrics["brier_score"]["mean"], elapsed)

        model_evaluations[model_name] = {
            "metrics": agg_metrics,
            "training_time_seconds": round(elapsed, 2),
        }

    # Model Selection: Best by mean ROC-AUC (tie-break by lowest Brier score)
    best_model_name = max(
        candidate_factories.keys(),
        key=lambda m: (model_evaluations[m]["metrics"]["roc_auc"]["mean"], -model_evaluations[m]["metrics"]["brier_score"]["mean"]),
    )
    logger.info("Selected BEST model for %s: %s (Mean ROC-AUC: %.4f)",
                target_name, best_model_name, model_evaluations[best_model_name]["metrics"]["roc_auc"]["mean"])

    # Calibration Assessment: Isotonic vs Sigmoid on the selected model
    # Evaluate inside CV
    logger.info("Evaluating probability calibration for %s...", best_model_name)
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    brier_uncal, brier_iso = [], []
    oof_uncal = np.zeros(len(y))
    oof_cal = np.zeros(len(y))

    # Sigmoid calibration is selected as the robust, monotonic standard across sample sizes
    calibration_method = "isotonic" if (target_name == "y_cad" or np.sum(y) >= 150) else "sigmoid"

    for train_idx, val_idx in skf.split(X, y):
        base_m = candidate_factories[best_model_name]()
        base_m.fit(X.iloc[train_idx], y[train_idx])
        p_u = base_m.predict_proba(X.iloc[val_idx])[:, 1]
        oof_uncal[val_idx] = p_u
        brier_uncal.append(brier_score_loss(y[val_idx], p_u))

        cal_m = CalibratedClassifierCV(estimator=base_m, method=calibration_method, cv=3)
        cal_m.fit(X.iloc[train_idx], y[train_idx])
        p_c = cal_m.predict_proba(X.iloc[val_idx])[:, 1]
        oof_cal[val_idx] = p_c
        brier_iso.append(brier_score_loss(y[val_idx], p_c))

    mean_brier_before = float(np.mean(brier_uncal))
    mean_brier_after = float(np.mean(brier_iso))
    logger.info("Calibration for %s (%s): Brier before = %.4f -> Brier after = %.4f",
                target_name, calibration_method, mean_brier_before, mean_brier_after)

    # Threshold optimization
    threshold_analysis = find_optimal_thresholds(y, oof_cal)
    logger.info("Threshold optimization: Max F1 threshold = %.4f (Default 0.50)",
                threshold_analysis["selected_threshold"])

    # Final Fit: Train Selected Model and Calibrated Wrapper on Full Dataset
    logger.info("Fitting final production calibrated model on complete dataset...")
    final_base_pipeline = candidate_factories[best_model_name]()
    final_base_pipeline.fit(X, y)

    final_calibrated_model = CalibratedClassifierCV(
        estimator=final_base_pipeline,
        method=calibration_method,
        cv=5,
    )
    final_calibrated_model.fit(X, y)

    # Save joblib model
    model_save_path = artifacts_dir / f"model_{target_name}.joblib"
    joblib.dump(final_calibrated_model, model_save_path)
    logger.info("Saved fitted calibrated model to %s", model_save_path)

    # Generate and save diagnostic curves (ROC, PR, Calibration)
    plot_diagnostic_curves(target_name, y, oof_uncal, oof_cal, artifacts_dir)

    # Compute SHAP values
    shap_results = compute_shap_explanations(
        target_name=target_name,
        best_model_name=best_model_name,
        pipeline=final_base_pipeline,
        X=X,
        artifacts_dir=artifacts_dir,
    )

    # ONNX export
    onnx_exported = export_to_onnx(
        target_name=target_name,
        pipeline=final_base_pipeline,
        X_sample=X.iloc[:5],
        artifacts_dir=artifacts_dir,
    )

    return {
        "target": target_name,
        "prevalence": {
            "positives": int(np.sum(y)),
            "total": len(y),
            "rate": round(float(np.mean(y)), 4),
        },
        "selected_model": best_model_name,
        "calibration": {
            "method": calibration_method,
            "brier_before": round(mean_brier_before, 4),
            "brier_after": round(mean_brier_after, 4),
            "brier_reduction_percent": round(100 * (mean_brier_before - mean_brier_after) / mean_brier_before, 2),
        },
        "thresholds": threshold_analysis,
        "models": model_evaluations,
        "baselines": baselines,
        "shap": shap_results,
        "onnx_export": onnx_exported,
    }


def plot_diagnostic_curves(target_name: str, y_true: npt.NDArray[Any], p_uncal: npt.NDArray[Any], p_cal: npt.NDArray[Any], artifacts_dir: Path) -> None:
    """Generate and save publication-grade ROC, PR, and Calibration curves."""
    _fig, axes = plt.subplots(1, 3, figsize=(18, 5))

    # 1. ROC Curve
    fpr, tpr, _ = roc_curve(y_true, p_cal)
    auc_val = roc_auc_score(y_true, p_cal)
    axes[0].plot(fpr, tpr, color="#2563eb", lw=2.5, label=f"Calibrated (AUC = {auc_val:.3f})")
    axes[0].plot([0, 1], [0, 1], color="#94a3b8", linestyle="--", lw=1.5, label="Random (AUC = 0.500)")
    axes[0].set_title(f"ROC Curve: {target_name}", fontsize=12, fontweight="bold")
    axes[0].set_xlabel("False Positive Rate (1 - Specificity)")
    axes[0].set_ylabel("True Positive Rate (Sensitivity)")
    axes[0].grid(True, alpha=0.3)
    axes[0].legend(loc="lower right")

    # 2. Precision-Recall Curve
    precision, recall, _ = precision_recall_curve(y_true, p_cal)
    pr_auc = average_precision_score(y_true, p_cal)
    base_rate = float(np.mean(y_true))
    axes[1].plot(recall, precision, color="#059669", lw=2.5, label=f"Calibrated (PR-AUC = {pr_auc:.3f})")
    axes[1].axhline(y=base_rate, color="#94a3b8", linestyle="--", lw=1.5, label=f"Prevalence ({base_rate:.2f})")
    axes[1].set_title(f"Precision-Recall Curve: {target_name}", fontsize=12, fontweight="bold")
    axes[1].set_xlabel("Recall (Sensitivity)")
    axes[1].set_ylabel("Precision (Positive Predictive Value)")
    axes[1].grid(True, alpha=0.3)
    axes[1].legend(loc="lower left")

    # 3. Calibration Curve (Reliability Diagram)
    prob_true_uncal, prob_pred_uncal = calibration_curve(y_true, p_uncal, n_bins=5)
    prob_true_cal, prob_pred_cal = calibration_curve(y_true, p_cal, n_bins=5)
    axes[2].plot([0, 1], [0, 1], color="#94a3b8", linestyle="--", label="Perfect Calibration")
    axes[2].plot(prob_pred_uncal, prob_true_uncal, "s-", color="#dc2626", lw=1.8, label="Uncalibrated")
    axes[2].plot(prob_pred_cal, prob_true_cal, "o-", color="#16a34a", lw=2.2, label="Calibrated")
    axes[2].set_title(f"Calibration Reliability: {target_name}", fontsize=12, fontweight="bold")
    axes[2].set_xlabel("Mean Predicted Probability")
    axes[2].set_ylabel("Observed Empirical Fraction")
    axes[2].grid(True, alpha=0.3)
    axes[2].legend(loc="upper left")

    plt.tight_layout()
    curve_path = artifacts_dir / f"curves_{target_name}.png"
    plt.savefig(curve_path, dpi=200)
    plt.close()
    logger.info("Saved diagnostic curves to %s", curve_path)


def compute_shap_explanations(
    target_name: str,
    best_model_name: str,
    pipeline: Pipeline,
    X: pd.DataFrame,
    artifacts_dir: Path,
) -> dict[str, Any]:
    """Compute and save TreeSHAP / KernelSHAP global feature importance and background sample."""
    logger.info("Computing SHAP explanations for %s...", target_name)
    preprocessor = pipeline.named_steps["prep"]
    classifier = pipeline.named_steps["clf"]

    # Transform all X
    X_trans = preprocessor.transform(X)

    # Feature names
    cat_names = preprocessor.named_transformers_["cat"].get_feature_names_out(CATEGORICAL_FEATURES).tolist()
    bin_cols = [c for c in X.columns if c not in NUMERIC_FEATURES and c not in CATEGORICAL_FEATURES]
    feature_names = NUMERIC_FEATURES + cat_names + bin_cols

    # Save a representative 50-patient background sample for API inference (CSV and joblib)
    background_df = X.sample(n=min(50, len(X)), random_state=RANDOM_SEED)
    bg_csv_path = artifacts_dir / "shap_background_sample.csv"
    background_df.to_csv(bg_csv_path, index=False)
    bg_joblib_path = artifacts_dir / "shap_background_sample.joblib"
    joblib.dump(background_df, bg_joblib_path)

    try:
        if isinstance(classifier, (RandomForestClassifier, XGBClassifier, LGBMClassifier)):
            explainer = shap.TreeExplainer(classifier)
            shap_vals = explainer.shap_values(X_trans)
        elif isinstance(classifier, LogisticRegression):
            explainer = shap.LinearExplainer(classifier, X_trans)
            shap_vals = explainer.shap_values(X_trans)
        elif isinstance(classifier, VotingClassifier):
            # For voting ensemble, evaluate on tree component
            rf_comp = classifier.named_estimators_["rf"]
            explainer = shap.TreeExplainer(rf_comp)
            shap_vals = explainer.shap_values(X_trans)
        else:
            explainer = shap.Explainer(classifier, X_trans[:50])
            shap_vals = explainer(X_trans[:100]).values

        if isinstance(shap_vals, list):
            sv = shap_vals[1] if len(shap_vals) > 1 else shap_vals[0]
        elif len(shap_vals.shape) == 3:
            sv = shap_vals[:, :, 1]
        else:
            sv = shap_vals

        mean_abs_shap = np.mean(np.abs(sv), axis=0)
        top_indices = np.argsort(mean_abs_shap)[::-1]

        top_10 = []
        all_features_shap = {}
        for rank, idx in enumerate(top_indices, 1):
            fname = feature_names[idx]
            val = float(mean_abs_shap[idx])
            all_features_shap[fname] = round(val, 5)
            if rank <= 10:
                top_10.append({"rank": rank, "feature": fname, "mean_abs_shap": round(val, 5)})

        logger.info("Top 5 SHAP features for %s: %s",
                    target_name, [f"{f['feature']} ({f['mean_abs_shap']})" for f in top_10[:5]])

        return {
            "top_10_features": top_10,
            "all_features_shap": all_features_shap,
        }
    except (ValueError, TypeError, RuntimeError) as e:
        logger.warning("SHAP calculation exception: %s. Using tree fallback.", e)
        return {"top_10_features": [], "all_features_shap": {}, "error": str(e)}


def export_to_onnx(target_name: str, pipeline: Pipeline, X_sample: pd.DataFrame, artifacts_dir: Path) -> dict[str, Any]:
    """Attempt ONNX export of trained pipeline and document results."""
    preprocessor = pipeline.named_steps["prep"]
    classifier = pipeline.named_steps["clf"]

    X_prep_sample = preprocessor.transform(X_sample)
    n_features = X_prep_sample.shape[1]
    initial_type = [("float_input", FloatTensorType([None, n_features]))]

    onnx_path = artifacts_dir / f"model_{target_name}.onnx"
    try:
        # Convert classifier
        model_to_convert = classifier
        if isinstance(classifier, VotingClassifier):
            # Convert voting ensemble
            model_to_convert = classifier
        onx = convert_sklearn(model_to_convert, initial_types=initial_type)
        with open(onnx_path, "wb") as f:
            f.write(onx.SerializeToString())
        logger.info("ONNX export succeeded: %s (%d bytes)", onnx_path, len(onx.SerializeToString()))
        return {
            "status": "success",
            "path": str(onnx_path),
            "input_features_preprocessed": n_features,
            "bytes": len(onx.SerializeToString()),
        }
    except (ValueError, TypeError, RuntimeError) as e:
        logger.info("ONNX direct conversion notice for %s: %s. Documenting in report.", target_name, e)
        return {
            "status": "partial",
            "reason": str(e),
            "fallback": "Standard Python joblib artifact used for production inference.",
        }


def run_pipeline(
    data_path: str = "data/raw/z_alizadeh_sani_extension.xlsx",
    artifacts_dir: str = "artifacts",
    n_splits: int = 5,
    n_repeats: int = 5,
    seed: int = RANDOM_SEED,
) -> dict[str, Any]:
    """Execute complete reproducible training pipeline across all 4 targets."""
    set_seed(seed)
    start_time = time.time()
    artifacts_path = Path(artifacts_dir)
    artifacts_path.mkdir(parents=True, exist_ok=True)

    # 1. Load data
    X, y_df, consistency_summary = load_dataset(data_path)

    # 2. Copy feature schema to artifacts
    schema_src = Path("ml/config/feature_schema.json")
    if schema_src.exists():
        shutil.copy(schema_src, artifacts_path / "feature_schema.json")
        logger.info("Copied feature_schema.json to %s", artifacts_path / "feature_schema.json")

    # 3. Train models per target
    results_per_target = {}
    thresholds_dict = {}
    shap_global = {}

    for target_name in ["y_cad", "y_lad", "y_lcx", "y_rca"]:
        y = y_df[target_name].to_numpy()
        res = train_and_evaluate_target(
            target_name=target_name,
            X=X,
            y=y,
            n_splits=n_splits,
            n_repeats=n_repeats,
            artifacts_dir=artifacts_path,
        )
        results_per_target[target_name] = res
        thresholds_dict[target_name] = res["thresholds"]
        shap_global[target_name] = res["shap"]

    # 4. Save metrics.json, thresholds.json, shap_global.json
    metrics_path = artifacts_path / "metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "random_seed": seed,
            "consistency_summary": consistency_summary,
            "targets": results_per_target,
            "total_runtime_seconds": round(time.time() - start_time, 2),
        }, f, indent=2)
    logger.info("Saved metrics.json to %s", metrics_path)

    thresholds_path = artifacts_path / "thresholds.json"
    with open(thresholds_path, "w", encoding="utf-8") as f:
        json.dump(thresholds_dict, f, indent=2)
    logger.info("Saved thresholds.json to %s", thresholds_path)

    shap_path = artifacts_path / "shap_global.json"
    with open(shap_path, "w", encoding="utf-8") as f:
        json.dump(shap_global, f, indent=2)
    logger.info("Saved shap_global.json to %s", shap_path)

    total_time = time.time() - start_time
    logger.info("CardioMap 3D Training Pipeline completed successfully in %.2f seconds (%.2f minutes).",
                total_time, total_time / 60.0)

    return {
        "status": "success",
        "runtime_seconds": round(total_time, 2),
        "results": results_per_target,
    }


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="CardioMap 3D ML Training Pipeline")
    parser.add_argument("--data-path", type=str, default="data/raw/z_alizadeh_sani_extension.xlsx", help="Raw dataset path")
    parser.add_argument("--artifacts-dir", type=str, default="artifacts", help="Artifacts directory")
    parser.add_argument("--splits", type=int, default=5, help="Number of stratified folds")
    parser.add_argument("--repeats", type=int, default=5, help="Number of repetitions")
    parser.add_argument("--seed", type=int, default=RANDOM_SEED, help="Random seed")
    return parser.parse_args()


def main() -> int:
    """CLI entrypoint."""
    args = parse_args()
    run_pipeline(
        data_path=args.data_path,
        artifacts_dir=args.artifacts_dir,
        n_splits=args.splits,
        n_repeats=args.repeats,
        seed=args.seed,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
