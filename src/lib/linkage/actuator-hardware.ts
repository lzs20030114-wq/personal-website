import { type ReadoutKey, TENDON_TAKEUP_MM } from './actuator-readout';
import { thetaAtStroke } from './machine';
import { thetaToStroke } from './machine-behavior';
import { MOTOR_ASSIGNMENTS, type MotorAssignment, type MotorId } from './actuator-motors';

/** Lab 1-6 的输出对应记录；不生成固件指令，不把仿真跟随量冒充硬件反馈。 */
export type HardwareId = 'tendon0' | 'tendon1' | 'tendon2' | 'servo0' | 'servo1' | 'breath' | 'yaw' | 'sound' | 'light';
type Bilingual = { zh: string; en: string };

export interface HardwareChannel {
  id: HardwareId;
  readoutKeys: readonly ReadoutKey[];
  label: Bilingual;
  hardware: Bilingual;
  calibration: Bilingual;
  formula: Bilingual;
  /** 历史方案也不表示型号、数量或接线已经在本台真机验证。 */
  basis: 'model-only' | 'historical-plan' | 'unselected';
  motor?: MotorAssignment;
}

function tendon(id: 'tendon0' | 'tendon1' | 'tendon2', n: number): HardwareChannel {
  return {
    id, readoutKeys: [id], basis: 'model-only', motor: MOTOR_ASSIGNMENTS[id],
    label: { zh: `大触手 · 腱 ${n}`, en: `Large arm · tendon ${n}` },
    hardware: { zh: '拟分配 NEMA17 + TMC2209 独立拉线轴；实装对应待核对', en: 'Proposed independent NEMA17 + TMC2209 cable axis; installed assignment unverified' },
    calibration: {
      zh: `0–${TENDON_TAKEUP_MM} mm 是模型行程。待测卷线有效半径、减速比、零位、收线方向、行程与负载；没有拉力读数。`,
      en: `0–${TENDON_TAKEUP_MM} mm is model travel. Effective spool radius, gearing, zero, direction, travel and load need calibration; no force reading.`,
    },
    formula: {
      zh: `模型 ΔL = c × ${TENDON_TAKEUP_MM} mm；标定后 θ电机 = θ零位 + 方向 × G × ΔL / r（rad，单层恒定半径）。`,
      en: `Model ΔL = c × ${TENDON_TAKEUP_MM} mm; after calibration, θmotor = θzero + direction × G × ΔL / r (rad, constant single-layer radius).`,
    },
  };
}

function servo(id: 'servo0' | 'servo1', side: Bilingual): HardwareChannel {
  return {
    id, readoutKeys: [id], basis: 'historical-plan', motor: MOTOR_ASSIGNMENTS[id],
    label: { zh: `小触须 · ${side.zh}`, en: `Small feeler · ${side.en}` },
    hardware: { zh: 'SG90；历史结构记录', en: 'SG90; historical mechanism record' },
    calibration: {
      zh: '±75° 是仿真驱动范围。待逐台测安装方向、中位、脉宽—角度关系、机械端点与负载速度。',
      en: '±75° is the simulated drive range. Calibrate mounting direction, centre, pulse-to-angle relation, mechanical stops and loaded speed per servo.',
    },
    formula: {
      zh: '角度 = base + gain × 受惊波形，夹在 ±75°；脉宽 p = 标定函数(角度)，单位 μs。',
      en: 'Angle = base + gain × startle wave, clamped to ±75°; pulse p = calibrated function(angle), in μs.',
    },
  };
}

/** 9 个逻辑设备覆盖现有 12 个读数；不是实物采购数量表。 */
export const HARDWARE_CHANNELS: readonly HardwareChannel[] = [
  tendon('tendon0', 1), tendon('tendon1', 2), tendon('tendon2', 3),
  servo('servo0', { zh: '左', en: 'left' }), servo('servo1', { zh: '右', en: 'right' }),
  {
    id: 'breath', readoutKeys: ['crank', 'crankRate'], basis: 'historical-plan', motor: MOTOR_ASSIGNMENTS.breath,
    label: { zh: '壳体 · 呼吸主驱动', en: 'Shell · breathing drive' },
    hardware: { zh: '档案：NEMA17 + TMC2209 → GT2 → 共轴齿轮与钢齿条；未完成装机标定', en: 'Recorded: NEMA17 + TMC2209 → GT2 → shared-shaft gears and steel racks; installation uncalibrated' },
    calibration: {
      zh: '网页曲柄角不是实物齿条位置。待确认当前传动、开合端点、每步位移、回零、速度与加速度。',
      en: 'Web crank angle is not rack position. Confirm current transmission, open/closed endpoints, distance per step, homing, speed and acceleration.',
    },
    formula: {
      zh: '行程 s：0 全开，1 折叠；齿条 x = 标定曲线 f(s)，只有验证线性后才按两端插值。曲柄用既有非线性反解。',
      en: 'Stroke s: 0 open, 1 folded; rack x = calibrated f(s). Interpolate endpoints only after confirming linearity. The crank uses existing nonlinear kinematics.',
    },
  },
  {
    id: 'yaw', readoutKeys: ['yaw', 'yawRate'], basis: 'historical-plan', motor: MOTOR_ASSIGNMENTS.yaw,
    label: { zh: '机身 · 转台', en: 'Body · turntable' },
    hardware: { zh: '档案：HDB60XZ45B 平台内置 42 步进 + TMC2209，45:1；具体电机 SKU 待核', en: 'Recorded: HDB60XZ45B platform with built-in size-42 stepper + TMC2209, 45:1; exact motor SKU unverified' },
    calibration: {
      zh: '±180° 是引擎范围。复核档案 45:1、机械行程、线缆边界、零位与限位；显示回绕不能替代机械限位。',
      en: '±180° is the engine range. Verify the recorded 45:1 ratio, travel, cable limits, zero and end stops; display angle wrapping is not a mechanical limit.',
    },
    formula: {
      zh: '电机角 = 零位 + 方向 × 减速比 × 机身角；仅在已标定的机械行程内成立。',
      en: 'Motor angle = zero + direction × gear ratio × body angle; valid only within calibrated mechanical travel.',
    },
  },
  {
    id: 'sound', readoutKeys: ['voice', 'pitch'], basis: 'historical-plan',
    label: { zh: '声音 · 扬声器', en: 'Sound · speaker' },
    hardware: { zh: '历史采购方案：PAM8403 + 4Ω 3W 扬声器', en: 'Historical purchase plan: PAM8403 + 4Ω 3W speaker' },
    calibration: {
      zh: '待确认音源接口、供电与增益；强度百分比不是 dB。发声时间比例不是电气 PWM 占空比。',
      en: 'Confirm audio source, supply and gain; normalized level is not dB. Voiced time per breath is not electrical PWM duty.',
    },
    formula: {
      zh: '发声开关 on、音高 f（Hz）、归一化强度分别控制；cycleVoiceFraction 是基础呼吸发声窗口，动作可覆盖，最终门控看 on。',
      en: 'Control on/off, pitch f (Hz) and level separately. cycleVoiceFraction is the base breath window; actions can override it. on is the final gate.',
    },
  },
  {
    id: 'light', readoutKeys: ['light'], basis: 'historical-plan',
    label: { zh: '灯光 · 灯环', en: 'Light · ring' },
    hardware: { zh: '历史采购方案：WS2812B 12 灯环', en: 'Historical purchase plan: 12-pixel WS2812B ring' },
    calibration: {
      zh: '待确认实装灯环、颜色、亮度响应、电源与电流预算；百分比不是照度，也不是普通单色 PWM 引脚值。',
      en: 'Confirm installed ring, colour, brightness response, power and current budget; percentage is neither illuminance nor a plain monochrome PWM pin value.',
    },
    formula: {
      zh: '亮度 L（0–1）→ 标定后的各灯 RGB 数字帧；颜色与亮度曲线尚未指定。',
      en: 'Brightness L (0–1) → calibrated RGB data frames per pixel; colour and brightness curve are unspecified.',
    },
  },
];

export interface HardwareQuantity { value: number; unit: 'mm' | '°' | '%' | 'fraction' }
export interface HardwareRow {
  id: HardwareId;
  /** 本次对照的电机位编号，不表示硬件已连接。声光没有此字段。 */
  motorId?: MotorId;
  simulated: HardwareQuantity;
  /** 单独的引擎目标，或没有独立跟随层的当前驱动命令。 */
  target: HardwareQuantity;
  electrical: null;
  feedback: null;
  extra?: {
    /** 仅用于显示的仿真角速度：0.15 s 平滑差分，不是硬件限速。 */
    velocityDegS?: number;
    crankDeg?: number;
    frequencyHz?: number;
    on?: boolean;
    /** 基础呼吸发声窗口占周期比例；动作可覆盖，以 on 为最终门控。不是 PWM duty。 */
    cycleVoiceFraction?: number;
  };
}

export interface HardwareSnapshot {
  /** 手动调试与行为输出分开；manual 的 timeS 为进入手动后的时间。 */
  controlMode?: 'behavior' | 'manual';
  schema: 'reincarnation-machine.hardware-map.v1';
  source: 'simulation';
  timeS: number;
  seed: number;
  persona: string;
  phase: string;
  lifeRate: number;
  rows: HardwareRow[];
  rawReadout: {
    values: Record<ReadoutKey, number>;
    targets: Partial<Record<ReadoutKey, number>>;
  };
}

export interface HardwareSnapshotInput {
  values: Record<ReadoutKey, number>;
  targets: Partial<Record<ReadoutKey, number>>;
  /** 直接取 tg.breath.s，避免从已四舍五入的显示文字反推。 */
  breathTarget: number;
  soundDuty: number;
  voicing: boolean;
  timeS: number;
  seed: number;
  persona: string;
  phase: string;
  lifeRate: number;
}

/** 只打包当前仿真样本。缺少标定和遥测，所有电气命令与实测反馈明确为空。 */
export function createHardwareSnapshot(input: HardwareSnapshotInput): HardwareSnapshot {
  const { values: v, targets: t } = input;
  const quantity = (value: number, unit: HardwareQuantity['unit']): HardwareQuantity => ({ value, unit });
  const row = (id: HardwareId, value: number, target: number, unit: HardwareQuantity['unit'], extra?: HardwareRow['extra']): HardwareRow => ({
    id, simulated: quantity(value, unit), target: quantity(target, unit), electrical: null, feedback: null,
    ...(MOTOR_ASSIGNMENTS[id] ? { motorId: MOTOR_ASSIGNMENTS[id]!.id } : {}),
    ...(extra ? { extra } : {}),
  });
  return {
    schema: 'reincarnation-machine.hardware-map.v1', source: 'simulation',
    timeS: input.timeS, seed: input.seed, persona: input.persona, phase: input.phase, lifeRate: input.lifeRate,
    rows: [
      row('tendon0', v.tendon0, t.tendon0 ?? v.tendon0, 'mm'),
      row('tendon1', v.tendon1, t.tendon1 ?? v.tendon1, 'mm'),
      row('tendon2', v.tendon2, t.tendon2 ?? v.tendon2, 'mm'),
      row('servo0', v.servo0, v.servo0, '°'),
      row('servo1', v.servo1, v.servo1, '°'),
      row('breath', thetaToStroke(thetaAtStroke(v.crank / 180)), input.breathTarget, 'fraction', { crankDeg: v.crank, velocityDegS: v.crankRate }),
      row('yaw', v.yaw, t.yaw ?? v.yaw, '°', { velocityDegS: v.yawRate }),
      row('sound', input.voicing ? v.voice : 0, input.voicing ? v.voice : 0, '%', { frequencyHz: v.pitch, on: input.voicing, cycleVoiceFraction: input.soundDuty }),
      row('light', v.light, v.light, '%'),
    ],
    rawReadout: { values: { ...v }, targets: { ...t } },
  };
}
