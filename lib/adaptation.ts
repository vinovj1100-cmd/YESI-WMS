import { db } from './db';
import { calculatePressureScore, type WarehousePressure } from './criticalWorkflow';

// ─── Dynamic Adaptation Engine ──────────────────────────────────────────
// Adapts UI behavior, recommendations, and workflow based on real-time load

export type AdaptationMode = 'normal' | 'efficiency' | 'surge' | 'crisis';

export interface AdaptationState {
  mode: AdaptationMode;
  recommendedPickingMethod: 'single' | 'batch' | 'zone' | 'wave';
  recommendedBatchSize: number;
  showPriorityColors: boolean;
  autoSuggestReplenishment: boolean;
  compactView: boolean;
  enableSoundAlerts: boolean;
  dashboardRefreshInterval: number; // seconds
  workerAlertThreshold: number; // tasks per worker
  suggestions: AdaptationSuggestion[];
  lastUpdated: string;
}

export interface AdaptationSuggestion {
  id: string;
  category: 'picking' | 'layout' | 'staffing' | 'inventory' | 'shipping';
  message: string;
  impact: 'high' | 'medium' | 'low';
  autoApply: boolean;
  applied?: boolean;
}

// Mode thresholds based on pressure score
function determineMode(pressure: WarehousePressure): AdaptationMode {
  if (pressure.score >= 80) return 'crisis';
  if (pressure.score >= 55) return 'surge';
  if (pressure.score >= 30) return 'efficiency';
  return 'normal';
}

// Generate contextual suggestions based on current state
async function generateSuggestions(pressure: WarehousePressure, mode: AdaptationMode): Promise<AdaptationSuggestion[]> {
  const suggestions: AdaptationSuggestion[] = [];

  if (mode === 'crisis') {
    suggestions.push({
      id: 'crisis-pick-mode',
      category: 'picking',
      message: 'CRISIS: Switch to batch picking with max batch size (50). Disable single-order picks.',
      impact: 'high',
      autoApply: true,
    });
    suggestions.push({
      id: 'crisis-overtime',
      category: 'staffing',
      message: 'Recommend overtime authorization. Worker utilization at ' + pressure.workerUtilization + '%',
      impact: 'high',
      autoApply: false,
    });
    suggestions.push({
      id: 'crisis-express-ship',
      category: 'shipping',
      message: 'Enable express ship lane for urgent orders only. Defer standard orders.',
      impact: 'high',
      autoApply: true,
    });
  } else if (mode === 'surge') {
    suggestions.push({
      id: 'surge-wave-batch',
      category: 'picking',
      message: 'High order volume detected. Increase wave batch size to 35 orders.',
      impact: 'high',
      autoApply: true,
    });
    suggestions.push({
      id: 'surge-zone-routing',
      category: 'layout',
      message: 'Enable zone-based routing to parallelize picks across ' + Math.ceil(pressure.activeWorkers / 2) + ' zones.',
      impact: 'medium',
      autoApply: false,
    });
  } else if (mode === 'efficiency') {
    suggestions.push({
      id: 'eff-single-pick',
      category: 'picking',
      message: 'Moderate load. Single-order picking recommended for accuracy on high-value SKUs.',
      impact: 'medium',
      autoApply: false,
    });
    suggestions.push({
      id: 'eff-preprime',
      category: 'inventory',
      message: 'Pre-prime fast-moving locations. Current zone utilization: ' + pressure.zoneUtilization + '%',
      impact: 'low',
      autoApply: false,
    });
  } else {
    // Normal mode
    suggestions.push({
      id: 'norm-cycle-count',
      category: 'inventory',
      message: 'Low pressure period. Ideal time for cycle counts and zone maintenance.',
      impact: 'low',
      autoApply: false,
    });
    suggestions.push({
      id: 'norm-training',
      category: 'staffing',
      message: 'Schedule cross-training for workers. Current workload allows skill development.',
      impact: 'low',
      autoApply: false,
    });
  }

  // Always add inventory-specific suggestions
  const lowStockCount = pressure.lowStockItems;
  if (lowStockCount > 0) {
    suggestions.push({
      id: 'inv-reorder',
      category: 'inventory',
      message: `${lowStockCount} SKUs below reorder point. Generate PO recommendations?`,
      impact: 'high',
      autoApply: lowStockCount > 5,
    });
  }

  return suggestions;
}

// Main adaptation calculation
export async function calculateAdaptation(): Promise<AdaptationState> {
  const pressure = await calculatePressureScore();
  const mode = determineMode(pressure);

  const state: AdaptationState = {
    mode,
    recommendedPickingMethod: mode === 'crisis' ? 'batch' : mode === 'surge' ? 'wave' : mode === 'efficiency' ? 'zone' : 'single',
    recommendedBatchSize: mode === 'crisis' ? 50 : mode === 'surge' ? 35 : mode === 'efficiency' ? 20 : 10,
    showPriorityColors: mode !== 'normal',
    autoSuggestReplenishment: mode === 'crisis' || mode === 'surge',
    compactView: mode === 'crisis',
    enableSoundAlerts: mode === 'crisis' || mode === 'surge',
    dashboardRefreshInterval: mode === 'crisis' ? 5 : mode === 'surge' ? 10 : 30,
    workerAlertThreshold: mode === 'crisis' ? 8 : mode === 'surge' ? 12 : 20,
    suggestions: await generateSuggestions(pressure, mode),
    lastUpdated: new Date().toISOString(),
  };

  // Persist adaptation state
  await db.preferences.put({
    key: 'adaptation_state',
    value: JSON.stringify(state),
    createdAt: new Date().toISOString(),
  });

  return state;
}

// Load cached adaptation
export async function getCurrentAdaptation(): Promise<AdaptationState> {
  const pref = await db.preferences.where({ key: 'adaptation_state' }).first();
  if (pref) {
    try {
      const cached = JSON.parse(pref.value) as AdaptationState;
      // Re-calculate if older than 5 minutes
      const age = Date.now() - new Date(cached.lastUpdated).getTime();
      if (age < 5 * 60000) return cached;
    } catch { /* noop */ }
  }
  return await calculateAdaptation();
}

// Auto-apply suggestions that are marked autoApply
export async function applyAutoSuggestions(state: AdaptationState): Promise<string[]> {
  const applied: string[] = [];
  for (const suggestion of state.suggestions) {
    if (suggestion.autoApply && !suggestion.applied) {
      suggestion.applied = true;
      applied.push(suggestion.id);
      // Here you would trigger actual workflow changes
      // e.g., update picking method preference, notify workers, etc.
    }
  }
  if (applied.length > 0) {
    await db.preferences.put({
      key: 'adaptation_state',
      value: JSON.stringify(state),
      createdAt: new Date().toISOString(),
    });
  }
  return applied;
}

// Mode color/theme mapping
export function getModeColors(mode: AdaptationMode) {
  switch (mode) {
    case 'crisis':
      return {
        bg: 'linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%)',
        border: 'rgba(239, 68, 68, 0.4)',
        text: '#fca5a5',
        accent: '#ef4444',
        icon: '🔴',
      };
    case 'surge':
      return {
        bg: 'linear-gradient(135deg, #713f12 0%, #451a03 100%)',
        border: 'rgba(245, 158, 11, 0.4)',
        text: '#fcd34d',
        accent: '#f59e0b',
        icon: '🟠',
      };
    case 'efficiency':
      return {
        bg: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
        border: 'rgba(16, 185, 129, 0.4)',
        text: '#6ee7b7',
        accent: '#10b981',
        icon: '🟢',
      };
    default:
      return {
        bg: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)',
        border: 'rgba(56, 189, 248, 0.2)',
        text: '#7dd3fc',
        accent: '#38bdf8',
        icon: '🔵',
      };
  }
}

// Time-of-day based predictions
export function getTimeBasedPrediction(): { peakHours: boolean; recommendedStartTime: string; message: string } {
  const hour = new Date().getHours();
  const isPeak = hour >= 9 && hour <= 17;
  return {
    peakHours: isPeak,
    recommendedStartTime: isPeak ? 'Now (peak period)' : '09:00 (shift start)',
    message: isPeak
      ? 'Peak operating hours. Expect higher order volume and reduced pick times.'
      : 'Off-peak period. Ideal for maintenance, cycle counts, and inventory rebalancing.',
  };
}
