# CardioMap 3D: Model Card & Clinical System Disclosures

## 1. Model Overview & Purpose
CardioMap 3D is a machine learning-powered clinical risk estimation and interactive 3D coronary visualization system. The model estimates the probability of obstructive coronary artery disease (CAD, $\ge 50\%$ diameter stenosis) overall and specifically across the three primary coronary arteries:
* **`y_cad`**: Overall coronary artery disease (derived from catheterization outcome `Cath`)
* **`y_lad`**: Left Anterior Descending artery stenosis
* **`y_lcx`**: Left Circumflex artery stenosis
* **`y_rca`**: Right Coronary Artery stenosis

**Intended Use**: Clinical decision-support tool for pre-catheterization risk stratification and anatomical visualization of coronary stenosis risk. It is **not** a standalone diagnostic device or medical device.

---

## 2. Training Data & Cohort Details
* **Source Dataset**: UCI Machine Learning Repository Dataset #411 ("Extension of Z-Alizadeh Sani Dataset").
* **Cohort Size**: 303 consecutive patients presenting for coronary angiography.
* **Input Features**: Exactly 55 non-invasive clinical features spanning demographics, medical history, physical examination, electrocardiography (ECG), laboratory serum biomarkers, and resting transthoracic echocardiography (TTE).
* **Single-Center Cohort Disclosure**: The training dataset originates from a single tertiary cardiovascular center. Baseline characteristics, referral patterns, and disease prevalence (71.3% CAD prevalence) reflect a high-risk referred cohort rather than an unselected general outpatient screening population. External multi-center validation is required prior to real-world clinical implementation.

---

## 3. Disclosed Model Assumptions & Limitations

### A. Fixed Hyperparameters Disclosure
All model architectures and hyperparameters were fixed *a priori* based on standard clinical tabular modeling conventions (e.g., Random Forest max depth 6 with class weighting; shallow LightGBM depth 2 with strong L2 regularization) with the exception of the ElasticNet logistic regression grid. Extensive automated hyperparameter optimization was purposefully restricted to prevent overfitting on the 303-patient cohort.

### B. Optimism Disclosure (Candidate & Threshold Selection)
Model architecture selection and optimal operational decision thresholds (Youden's $J$, Max $F_1$) were determined using out-of-fold predictions from the same 303-patient cohort. Although 5-fold × 5-repeat stratified cross-validation safeguards feature scaling and imputation from leakage, tuning operational operating points on the same cross-validation cohort introduces an optimistic threshold bias.

### C. LCX and RCA Statistical Benchmark Disclosure
For Left Circumflex (`y_lcx`) and Right Coronary Artery (`y_rca`), the winning multi-feature models (`LightGBM` AUC 0.7491 and `LGBM_Shallow` AUC 0.7535) are statistically tied (within 1 standard error, $SE \approx 0.015$) with a simple 6-feature clinical baseline logistic regression (`Age`, `Sex`, `HTN`, `DM`, `Current Smoker`, `Typical Chest Pain`, AUC 0.743 and 0.741). Isolated posterior and inferior vessel lesions show less distinct repolarization shifts on standard 12-lead ECG, setting an intrinsic biological ceiling for non-invasive prediction.

### D. Region RWMA Semantics Disclosure
The dataset records `Region RWMA` as integer codes ranging from `0` to `4` (representing the number of echocardiographic segments exhibiting regional wall motion hypokinesis/akinesis). **The exact spatial mapping of codes 0 to 4 to specific coronary anatomical territories is unverified in dataset documentation.** Therefore, `Region RWMA` is modeled strictly as a non-spatial ordinal severity continuum. **No specific anatomical vessel territory is inferred from the RWMA code.**

### E. Explainability Disclosure (Association vs. Causation)
Feature attributions generated via SHAP (SHapley Additive exPlanations) represent model-learned mathematical associations within this specific dataset, **not causal medical findings**. Altering a patient's modifiable biomarker (e.g., lowering triglycerides or blood sugar) will change the model's computed score, but the attribution does not prove that the biomarker directly caused or will reverse coronary plaque formation.

Furthermore, several features (e.g., sodium `Na`, height `Length`, platelet count `PLT`, leukocyte counts `WBC`/`Lymph`/`Neut`) demonstrate moderate-to-low ranking stability across bootstrap resamples (persistence $< 0.8$) and likely reflect sample-specific statistical correlations rather than stable pathophysiological drivers.

---

## 4. Operational Risk Level Rules & Safety Guardrails

### A. Strict Risk Level Mapping
To guarantee that qualitative risk categories never contradict binary prediction labels, the risk tier is determined strictly from each target's own validated operating threshold $t$:
* **Low Risk**: $p < t$ (Prediction Label: `Negative / Low Risk`)
* **Moderate Risk**: $t \le p < t + 0.15$ (Prediction Label: `Positive / Elevated Risk`)
* **High Risk**: $p \ge t + 0.15$ (Prediction Label: `Positive / Elevated Risk`)

Under this rule, a prediction is classified as positive if and only if the risk level is Moderate or High.

### B. Probability Safety Clipping
All calibrated probability outputs are clipped to $[0.01, 0.99]$ at inference. No model output can ever return absolute certainty ($0.0$ or $1.0$).

### C. Vessel-CAD Coherence Adjustment
If any individual vessel stenosis probability exceeds the overall CAD probability ($p_{\text{CAD}} < \max(p_{\text{LAD}}, p_{\text{LCX}}, p_{\text{RCA}})$), the API flags this anatomical incoherence and returns both the raw CAD probability and a coherent adjusted probability equal to $\max(p_{\text{CAD}}, p_{\text{vessels}})$.
