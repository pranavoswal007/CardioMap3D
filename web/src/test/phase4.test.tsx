import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

import { getDisplayRiskLabel, formatHonestyComparisonText } from '../utils/riskLabels';
import { CANONICAL_DISCLAIMER } from '../constants/disclaimer';
import { DisclaimerBanner } from '../components/DisclaimerBanner';
import { ProbabilityBar, TargetCard, ResultCards } from '../components/ResultCards';
import { PatientForm } from '../components/PatientForm';
import { useAppStore } from '../store/useAppStore';

import {
  SCHEMA_FIXTURE,
  PREDICT_FIXTURE,
  PREDICT_INCOHERENT_FIXTURE,
  BOOTSTRAP_FIXTURES,
} from '../__fixtures__';

describe('Phase 4: Web Integration Test Suite', () => {
  beforeEach(() => {
    useAppStore.getState().resetPatientInputs();
  });

  // 1. Label mapping
  it('correctly maps API risk levels to clinical screening labels', () => {
    expect(getDisplayRiskLabel('low')).toBe('below screening cutoff');
    expect(getDisplayRiskLabel('moderate')).toBe('above screening cutoff');
    expect(getDisplayRiskLabel('high')).toBe('well above screening cutoff');
    expect(getDisplayRiskLabel(null)).toBe('below screening cutoff');
    expect(getDisplayRiskLabel(undefined)).toBe('below screening cutoff');
  });

  // 2. Forbidden phrase absent from src and rendered card outputs
  it('ensures the forbidden phrase is absent from src files', () => {
    const srcDir = path.resolve(__dirname, '..');
    const forbidden = ['moderate', 'risk'].join(' '); // avoid literal in test file

    function scanDir(dir: string): string[] {
      let results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(scanDir(fullPath));
        } else if (/\.(tsx?|css|html|json)$/.test(entry.name) && entry.name !== 'phase4.test.tsx') {
          const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();
          if (content.includes(forbidden)) {
            results.push(fullPath);
          }
        }
      }
      return results;
    }

    const matches = scanDir(srcDir);
    expect(matches).toEqual([]);
  });

  it('ensures the forbidden phrase is absent from rendered output across all card states', () => {
    const forbidden = ['moderate', 'risk'].join(' ');
    const testCases: ('low' | 'moderate' | 'high')[] = ['low', 'moderate', 'high'];

    for (const level of testCases) {
      const pred = {
        probability: 0.65,
        label: 1,
        risk_level: level,
        cohort_prevalence: 0.58,
        relative_risk: 1.12,
        threshold: 0.50,
        high_threshold: 0.65,
      };

      const { container, unmount } = render(
        <TargetCard
          id="cad"
          title="CAD"
          subtitle="Overall"
          prediction={pred}
          isSelected={false}
          onSelect={() => {}}
        />
      );

      const text = container.textContent?.toLowerCase() || '';
      expect(text.includes(forbidden)).toBe(false);
      unmount();
    }
  });

  // 3. Tick marks placed from API values
  it('places probability bar tick marks according to API values', () => {
    render(<ProbabilityBar probability={0.8591} threshold={0.5377} highThreshold={0.6877} />);

    const threshTick = screen.getByTestId('threshold-tick');
    const highThreshTick = screen.getByTestId('high-threshold-tick');
    const fill = screen.getByTestId('probability-fill');

    expect(threshTick).toHaveStyle({ left: '53.8%' });
    expect(highThreshTick).toHaveStyle({ left: '68.8%' });
    expect(fill).toHaveStyle({ width: '85.9%' });
  });

  // 4. Form generated dynamically from schema fixture
  it('generates patient input form inputs from schema fixture', () => {
    useAppStore.getState().setSchemaData(SCHEMA_FIXTURE);
    render(<PatientForm />);

    expect(screen.getByLabelText(/Age/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sex/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Diabetes Mellitus/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Regional Wall Motion/)).toBeInTheDocument();
  });

  // 5. Abort cancels in-flight explain calls on form change or cancel
  it('cancels in-flight requests when abort controllers are triggered', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();

    useAppStore.getState().setPredictAbortController(c1);
    useAppStore.getState().setExplainAbortController('cad', c2);

    expect(c1.signal.aborted).toBe(false);
    expect(c2.signal.aborted).toBe(false);

    // Changing patient inputs cancels all in flight per contract
    useAppStore.getState().setPatientInput('Age', 65);

    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
  });

  // 6. Coherence banner appears and disappears
  it('shows coherence notice only when API flags inconsistency', () => {
    // 1. Coherent prediction -> No banner
    act(() => {
      useAppStore.getState().setPrediction(PREDICT_FIXTURE);
    });
    const { rerender } = render(<ResultCards />);
    expect(screen.queryByText(/Model-Consistency Notice/i)).not.toBeInTheDocument();

    // 2. Incoherent prediction -> Banner renders
    act(() => {
      useAppStore.getState().setPrediction(PREDICT_INCOHERENT_FIXTURE);
    });
    rerender(<ResultCards />);
    expect(screen.getByText(/Model-Consistency Notice/i)).toBeInTheDocument();
  });

  // 7. Disclaimer equality with api/openapi.json
  it('asserts canonical disclaimer equals openapi.json info.description', () => {
    const openApiPath = path.resolve(__dirname, '../../../api/openapi.json');
    const openApiRaw = fs.readFileSync(openApiPath, 'utf8');
    const openApiJson = JSON.parse(openApiRaw);

    expect(CANONICAL_DISCLAIMER).toBe(openApiJson.info.description);

    render(<DisclaimerBanner />);
    const banner = screen.getByTestId('canonical-disclaimer');
    expect(banner.textContent).toContain(openApiJson.info.description);
  });

  // 8. Honesty text per target from bootstrap fixture
  it('evaluates paired bootstrap honesty text accurately without claiming outperforms when CI includes 0', () => {
    // CAD: includes 0
    const cadText = formatHonestyComparisonText(BOOTSTRAP_FIXTURES.y_cad);
    expect(cadText).toBe('not significantly different');
    expect(cadText.toLowerCase()).not.toContain('outperforms');

    // LAD: excludes 0, delta > 0
    const ladText = formatHonestyComparisonText(BOOTSTRAP_FIXTURES.y_lad);
    expect(ladText).toBe('statistically better');

    // LCX: includes 0, baseline >= deployed
    const lcxText = formatHonestyComparisonText(BOOTSTRAP_FIXTURES.y_lcx);
    expect(lcxText).toBe('not significantly different (baseline matched or exceeded)');
    expect(lcxText.toLowerCase()).not.toContain('outperforms');

    // RCA: includes 0, baseline >= deployed
    const rcaText = formatHonestyComparisonText(BOOTSTRAP_FIXTURES.y_rca);
    expect(rcaText).toBe('not significantly different (baseline matched or exceeded)');
    expect(rcaText.toLowerCase()).not.toContain('outperforms');
  });

  // 9. App code never imports fixtures
  it('guarantees application source code never imports __fixtures__', () => {
    const srcDir = path.resolve(__dirname, '..');
    const appFiles: string[] = [];

    function findAppFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__fixtures__' && entry.name !== 'test') {
            findAppFiles(fullPath);
          }
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          appFiles.push(fullPath);
        }
      }
    }

    findAppFiles(srcDir);
    expect(appFiles.length).toBeGreaterThan(0);

    for (const file of appFiles) {
      const code = fs.readFileSync(file, 'utf8');
      expect(code).not.toMatch(/from\s+['"][^'"]*__fixtures__[^'"]*['"]/);
    }
  });

  // 10. RWMA fields have no territory text
  it('confirms Region RWMA input has no anatomical territory text', () => {
    useAppStore.getState().setSchemaData(SCHEMA_FIXTURE);
    render(<PatientForm />);

    const label = screen.getByLabelText(/Regional Wall Motion/);
    expect(label).toBeInTheDocument();

    const containerText = label.parentElement?.textContent?.toLowerCase() || '';
    const territoryWords = ['anterior', 'inferior', 'lateral', 'septal', 'apex', 'territory'];
    for (const word of territoryWords) {
      expect(containerText).not.toContain(word);
    }
  });
});
