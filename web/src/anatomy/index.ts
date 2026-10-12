import coronaryData from './coronary.json';
import type { VesselConfig, CoronaryDataConfig } from '../types/viewer';

export const coronaryConfig = coronaryData as unknown as CoronaryDataConfig;
export const vesselsList: VesselConfig[] = coronaryConfig.vessels;
