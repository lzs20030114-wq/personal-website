import type { HardwareId } from './actuator-hardware';

type Bilingual = { zh: string; en: string };
export type MotorId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7';

/** 逻辑输出与电机位的对应。编号是本次控制轴分配，不证明当前装机或已完成标定。 */
export interface MotorAssignment {
  id: MotorId;
  name: Bilingual;
  type: 'stepper' | 'servo';
  model: string;
  status: 'proposed' | 'historical-role' | 'recorded-plan';
  evidence: Bilingual;
  transmission: Bilingual;
  shaftNote: Bilingual;
}

/** 档案条件演算常量；不改变行为引擎或网页曲柄求解器，也不声称是装机标定。 */
export const MOTOR_TRANSMISSION = {
  breath: { beltRatio: 3, shaftSweepDeg: 336, moduleMm: 1, teeth: [32, 33, 32, 29, 25] },
  yaw: { ratio: 45 },
} as const;

const cableMotor = (id: 'M1' | 'M2' | 'M3', n: number): MotorAssignment => ({
  id, type: 'stepper', model: 'NEMA17 + TMC2209', status: 'proposed',
  name: { zh: `大触手第 ${n} 根腱收线电机`, en: `Main arm cable motor ${n}` },
  evidence: {
    zh: '档案有 NEMA17 与线轮记录，07-09 采购表另列三独立腱轴的条件增购。本轮拟分配为三个独立收线轴，当前装配对应仍需核对。',
    en: 'Records include NEMA17 motors and cable drums; the July 9 list makes an additional motor conditional on three independent tendon axes. Three cable axes are assigned here as a proposal; installed routing remains unverified.',
  },
  transmission: {
    zh: '电机 → 传动比待核的绞盘 → 对应肌腱。收线增加不直接等于某个固定电机转角。',
    en: 'Motor → winch with ratio to confirm → assigned tendon. Increased take-up does not yet imply a known motor rotation.',
  },
  shaftNote: {
    zh: '缺有效卷径、绕线层数、传动比、零位及方向，电机角留空。44 mm 是模型收线范围；真机行程与负载待标定。',
    en: 'Effective drum radius, winding layers, ratio, zero and direction are missing, so motor angle stays blank. The 44 mm range is a model setting; physical travel and load need calibration.',
  },
});

const feelerMotor = (id: 'M4' | 'M5', side: Bilingual): MotorAssignment => ({
  id, type: 'servo', model: 'SG90', status: 'historical-role',
  name: { zh: `${side.zh}小触须根部舵机`, en: `${side.en} feeler root servo` },
  evidence: {
    zh: '整机结构记录由 SG90 驱动小触须根部；库存表预留触须两只。个体型号、装机状态与实测行程仍需核验。',
    en: 'The mechanism record assigns SG90s to the feeler roots, with two units reserved in the inventory. Individual units, installation and measured travel remain unverified.',
  },
  transmission: {
    zh: '舵机输出轴 → 小触须根部大节；柔性段与末端被动跟随。',
    en: 'Servo output shaft → feeler root link; the flexible section and tip follow passively.',
  },
  shaftNote: {
    zh: '显示模型相对中位角，不是电机实测角。左右安装方向、中位、脉宽—角度曲线与机械端点逐只标定；不默认统一脉宽。',
    en: 'Shown angle is relative to the model centre, not measured motor position. Calibrate mounting direction, centre, pulse-to-angle curve and stops separately; no universal pulse endpoints are assumed.',
  },
});

/** 电机位编号是本轮对照编号；状态始终保留“提案/历史角色/档案方案”，不升级为已装机。 */
export const MOTOR_ASSIGNMENTS: Readonly<Partial<Record<HardwareId, MotorAssignment>>> = {
  tendon0: cableMotor('M1', 1),
  tendon1: cableMotor('M2', 2),
  tendon2: cableMotor('M3', 3),
  servo0: feelerMotor('M4', { zh: '左', en: 'Left' }),
  servo1: feelerMotor('M5', { zh: '右', en: 'Right' }),
  breath: {
    id: 'M6', name: { zh: '五环共轴呼吸电机', en: 'Shared five-ring breathing motor' },
    type: 'stepper', model: 'NEMA17 + TMC2209', status: 'recorded-plan',
    evidence: {
      zh: '档案记录 NEMA17（0.51 N·m / 1.7 A）、TMC2209、GT2 共轴传动；后期方案为 m1 钢齿轮 32/33/32/29/25 齿与钢齿条，中轴摆角 336°。最终齿数、材料与装机待核，额定记录不是带载验证。',
      en: 'Records specify NEMA17 (0.51 N·m / 1.7 A), TMC2209 and a GT2 shared shaft. A later plan uses module-1 steel gears with 32/33/32/29/25 teeth and steel racks over a 336° sweep. Final teeth, material and installation are unverified; ratings are not loaded validation.',
    },
    transmission: {
      zh: '电机 → GT2 → 共轴五对齿轮 → 每环两根反向齿条 → 五环。网页仍显示原曲柄模型，硬件角度另按档案条件演算。',
      en: 'Motor → GT2 → five gear pairs on one shaft → paired racks → five rings. The web model retains its crank mechanism; hardware angles are separate conditional calculations.',
    },
    shaftNote: {
      zh: '沿用 GT2 3:1、并把行为 s 线性映射到中轴 336°，是本轮演算假设。齿条数值为 S1–S5 每对中单根的位移幅值，不是两脚间距变化。实装减速比、起点、方向、回差与限位待复核。',
      en: 'GT2 3:1 and linear s to 336° are calculation assumptions. Rack values are per-rack travel magnitudes for the S1–S5 pairs, not changes in foot separation. Verify installed ratio, origins, direction, backlash and limits.',
    },
  },
  yaw: {
    id: 'M7', name: { zh: '机身转台内置电机', en: 'Built-in body turntable motor' },
    type: 'stepper', model: 'HDB60XZ45B · size-42 stepper + TMC2209', status: 'recorded-plan',
    evidence: {
      zh: '后期原始记录出现 HDB60XZ45B 平台、内置 42 步进和 45:1。记录对内置电机具体 SKU 的识读不一致，故不锁定 1704HS20D5 或 SM1705。',
      en: 'Later records identify the HDB60XZ45B platform, a built-in size-42 stepper and 45:1 reduction. The internal motor SKU is read inconsistently, so neither 1704HS20D5 nor SM1705 is asserted.',
    },
    transmission: {
      zh: '平台内置步进 → 45:1 减速 → 上部机身转向；不是另把一台散装 NEMA17 固定算入平台。',
      en: 'Platform stepper → 45:1 reduction → upper-body orientation; no additional standalone NEMA17 is assumed on top of the built-in motor.',
    },
    shaftNote: {
      zh: '按档案 45:1 演算电机相对零位转角，不是累计圈数；具体 SKU、细分、零位、正方向、线缆行程与带载速度仍待核验。',
      en: 'Motor rotation relative to zero uses the recorded 45:1 ratio; it is not accumulated turns. Confirm the SKU, external microsteps, zero, sign, cable travel and loaded speed.',
    },
  },
};

export interface MotorEstimate {
  shaftDeg: number | null;
  outputDeg?: number;
  /** S1–S5 各对齿条中单根相对起点的理论位移幅值，mm；不是位置回读或两脚间距变化。 */
  rackMm?: number[];
  note: Bilingual;
}

/**
 * 档案条件演算。breath 的 current 必须为 0–1 的 s，servo/yaw 必须为度；不收曲柄度或界面百分数。
 * 返回的角度全部是模型/演算值，没有 STEP 数或 μs；未知尺寸保持 null。
 */
export function motorEstimate(id: HardwareId, current: number): MotorEstimate {
  const motor = MOTOR_ASSIGNMENTS[id];
  if (!motor) return { shaftDeg: null, note: { zh: '非电机输出。', en: 'Not a motor output.' } };
  if (!Number.isFinite(current)) return { shaftDeg: null, note: { zh: '等待有效仿真样本。', en: 'Awaiting a finite simulation sample.' } };
  if (id === 'breath') {
    if (current < 0 || current > 1) return { shaftDeg: null, note: { zh: '需传入 0–1 行程 s，不能传曲柄角或百分数。', en: 'Use stroke s in 0–1, not crank degrees or a percentage.' } };
    const t = MOTOR_TRANSMISSION.breath;
    const outputDeg = current * t.shaftSweepDeg;
    return {
      shaftDeg: outputDeg * t.beltRatio,
      outputDeg,
      rackMm: t.teeth.map((z) => Math.PI * t.moduleMm * z * outputDeg / 360),
      note: { ...motor.shaftNote },
    };
  }
  if (id === 'yaw') return { shaftDeg: current * MOTOR_TRANSMISSION.yaw.ratio, outputDeg: current, note: { ...motor.shaftNote } };
  if (id === 'servo0' || id === 'servo1') return { shaftDeg: current, outputDeg: current, note: { ...motor.shaftNote } };
  return { shaftDeg: null, note: { ...motor.shaftNote } };
}

/**
 * 根据相邻物理量样本的变化描述所需轴运动，不从当前位置的正负推断转动方向。
 * current 与 delta 必须同单位：肌腱 mm、触须/偏航 °、呼吸归一化行程或其百分比。
 * 齿条方向只指展开/折叠的运动意图；未标定齿条正方向，不能解释成电机顺/逆时针。
 */
export function motorMotion(
  id: HardwareId,
  current: number,
  delta: number | undefined,
  paused: boolean,
  lang: 'zh' | 'en',
): string {
  const zh = lang === 'zh';
  if (id === 'sound' || id === 'light') return zh ? '非电机输出' : 'Not a motor output';
  if (!Number.isFinite(current)) return zh ? '等待仿真样本' : 'Awaiting simulation sample';
  if (paused) return zh ? '已暂停' : 'Paused';
  if (delta === undefined || !Number.isFinite(delta)) return zh ? '等待相邻采样' : 'Awaiting adjacent sample';
  if (Math.abs(delta) < 1e-8) return zh ? '保持' : 'Holding';
  const positive = delta > 0;
  switch (id) {
    case 'tendon0':
    case 'tendon1':
    case 'tendon2':
      return zh ? positive ? '收线' : '放线' : positive ? 'Taking up cable' : 'Paying out cable';
    case 'servo0':
    case 'servo1':
      return zh ? positive ? '向正角摆动' : '向负角摆动' : positive ? 'Swinging toward positive angle' : 'Swinging toward negative angle';
    case 'breath':
      return zh ? positive ? '齿条向折叠方向' : '齿条向展开方向' : positive ? 'Rack toward folding' : 'Rack toward opening';
    case 'yaw':
      return zh ? positive ? '转台向正角方向' : '转台向负角方向' : positive ? 'Turntable toward positive angle' : 'Turntable toward negative angle';
  }
}
