import type { Bilingual, LogTableBlock } from './log-schema';

// Lab 1-6 硬件对应的只读附件。复用日志表格 schema 与 BlockRail / BlockView。
// 传感分配：轮回机器_盘点.md §8；事件：轮回机器_行为引擎spec.md §3；
// 库存 / 采购状态：轮回机器_工作日志表格附录.md T-0707-4、T-0707-6。
// 本表不证明硬件已接通，不把归一化刺激强度写成实测力、声压或电容。
const t = (en: string, zh: string): Bilingual => ({ en, zh });

const sources = [
  '[1] https://ruccs.rutgers.edu/images/personal-jacob-feldman/papers/tremoulet_feldman2000.pdf',
  '[2] https://www.bartneck.de/publications/2010/perceptionAffectElicitedRobotMotion/index.html',
  '[3] https://link.springer.com/article/10.1007/s12369-009-0012-8',
  '[4] https://pubmed.ncbi.nlm.nih.gov/26476639/',
  '[5] https://github.com/arduino-libraries/Servo/blob/master/docs/api.md',
  '[6] https://github.com/arduino/reference-en/blob/master/Language/Functions/Advanced%20IO/tone.adoc',
  '[7] https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf',
].join('\n');

export const HARDWARE_REFERENCE_TABLES: LogTableBlock[] = [
  {
    kind: 'table',
    head: [
      t('Input', '传感输入'),
      t('Hardware assignment', '硬件对应'),
      t('Raw quantity to record', '应记录的原始量'),
      t('Engine event', '进入引擎的事件'),
      t('Still to establish', '仍需确认或标定'),
    ],
    rows: [
      [
        t('Touch either side of either feeler', '触碰两条触须的左右侧'),
        t('MPR121 ch0–3; four electrodes', 'MPR121 ch0–3，四个电极'),
        t('Filtered reading, baseline and touch/release state per electrode; timestamp', '每电极滤波读数、基线、触摸/释放状态与时间戳'),
        'FEELER_TOUCH { feeler: 0/1, side: L/R }',
        t('Map each channel to a physical side; touch/release thresholds and debounce. Capacitance is not force.', '逐一确认通道与物理侧的接线、触摸/释放阈值和去抖；电容读数不等于触碰力。'),
      ],
      [
        t('Stroke or hold the shell', '抚摸或按住壳体'),
        t('MPR121 ch4–5; left/right half electrodes', 'MPR121 ch4–5，左/右半壳电极'),
        t('Electrode readings and baseline; onset, release and duration', '电极读数与基线、接触和释放时刻、持续时间'),
        'SHELL_STROKE { half, touch } / SHELL_HOLD { half, on }',
        t('Validate pat/stroke/poke classification and long-hold baseline drift; two electrodes do not directly measure a hand trajectory.', '实测验证轻拍/抚摸/戳的分类及久握基线漂移；两片电极不能直接测得手的轨迹。'),
      ],
      [
        t('Touch the main arm', '触碰大触手'),
        t('A spare MPR121 channel; electrode number not fixed', 'MPR121 备用通道，电极编号未定'),
        t('Electrode reading, baseline and contact on/off', '电极读数、基线与接触开/关'),
        'ARM_TOUCH { on, by? }',
        t('Electrode placement and thresholds; contact alone cannot establish who initiated it or reliably identify a human.', '确认电极位置和阈值；仅凭接触电平不能判断谁主动碰谁，也不能可靠识别人。'),
      ],
      [
        t('Resistance while winding', '收线时遇到阻力'),
        t('Three lever microswitches, one per spring-loaded idler; procurement plan', '三个杠杆微动开关，每根肌腱张紧惰轮各一个；采购方案'),
        t('Three digital states, switching times and debounce state', '三路数字电平、触发时刻与去抖状态'),
        'RESISTANCE { on }',
        t('Define aggregation into one event; calibrate preload and operating threshold. A switch is a threshold detector, not a force reading in N.', '确认三路合并成单一事件的规则，标定预紧与触发阈值；微动只报是否越阈，不能给出 N 单位的力。'),
      ],
      [
        t('A person approaches or leaves', '人走近或离开'),
        t('HC-SR04; echo voltage divider in the recorded ESP32 plan', 'HC-SR04；档案中的 ESP32 方案含 echo 分压'),
        t('Echo duration in μs, distance in mm, validity and sample age', '回波时长 μs、换算距离 mm、有效性和读数年龄'),
        'PRESENCE { band, bearing? }',
        t('Mounting, blind zone and occlusion; range alone does not identify a person or provide bearing. Missing echo is not zero distance.', '标定安装位、盲区与遮挡；单路距离不能识别人或给出方位；回波缺失不是距离为零。'),
      ],
      [
        t('A knock or lifting the body', '敲击或拿起机身'),
        'MPU6050',
        t('Three-axis acceleration, configured range, timestamp and derived envelope', '三轴加速度、配置量程、时间戳与派生包络'),
        'KNOCK { intensity } / LIFT { lifted }',
        t('Calibrate units, mounting and motor-noise rejection. The proposed lift rule also uses ultrasonic validity; neither signal alone proves lifting.', '标定单位、安装方向和电机自干扰；档案的拿起规则还结合超声有效性，任一信号都不能单独证明被拿起。'),
      ],
      [
        t('External sound', '外界声音'),
        t('Kit sound module AO → ADC; exact module unrecorded', '套件声音模块 AO → ADC，具体型号未记'),
        t('ADC samples, configured resolution, noise floor and short-window envelope', 'ADC 采样、配置分辨率、噪声底与短窗幅度包络'),
        'SOUND { level }',
        t('Calibrate normalized level and mask self-generated sound. Envelope is not dB SPL or speech recognition; pin selection depends on the board.', '标定归一化幅度并屏蔽自身发声；包络不等于 dB 声压或语音识别，具体引脚随板型确定。'),
      ],
      [
        t('Elapsed time', '时间流逝'),
        t('Internal monotonic clock; no additional sensor', '内部单调时钟，无需新增传感器'),
        t('Elapsed milliseconds and separate motion/life clocks', '经过的毫秒数，分别记录动作钟与生命钟'),
        t('Engine timing and lifecycle events', '引擎定时与生命周期事件'),
        t('Preserve the two clocks when porting; the bench life-rate control must not multiply motor speed.', '移植时保留两种时钟；台架生命倍率不能直接乘到电机速度上。'),
      ],
      [
        t('Track a hand in space', '追踪空间中的手'),
        t('Current input: browser pointer and virtual geometry', '当前输入：浏览器指针与虚拟几何'),
        t('Virtual bearing/dist/face/aimDir/aimBend/aimDist; timestamp', '虚拟 bearing/dist/face/aimDir/aimBend/aimDist 与时间戳'),
        'HAND { on, bearing, dist, face, aimDir, aimBend, aimDist }',
        t('Physical hand tracking is not selected or validated. The listed sensors cannot supply all these fields; real tracking and coordinate calibration remain open.', '真机手部追踪尚未选型与验证；上述传感器不能提供全部字段，仍需追踪方案与坐标标定。'),
      ],
    ],
    caption: t(
      'Sensor inputs → engine events. Hardware assignments follow the project inventory and behaviour spec §3; stock and procurement records do not prove wiring or firmware validation. Raw readings, derived events and actuator commands are separate records. Event intensity 0–1 is a behaviour input, not a measured force or sound-pressure unit.',
      '传感输入 → 引擎事件。硬件分配依据项目盘点与行为引擎 spec §3；库存与采购记录不代表已接线或已完成固件验证。原始读数、派生事件与执行器命令分别记录；事件强度 0–1 是行为输入，不能当成实测力或声压。',
    ),
  },
  {
    kind: 'table',
    head: [
      t('Expression or interface', '动作表现或接口'),
      t('What to quantify', '应量化什么'),
      t('Primary source and applicable limit', '一手来源与适用边界'),
    ],
    rows: [
      [
        t('Movement that may appear alive', '可能让人感到有生命的运动'),
        t('Speed change, direction change and body orientation relative to movement', '速度变化、方向变化，以及身体朝向与运动方向的关系'),
        t('[1] Tremoulet & Feldman (2000): these cues affected animacy judgments of a single moving object. No motor settings or effect size for this machine follow from that experiment.', '[1] Tremoulet 与 Feldman（2000）：这些线索影响单个运动物体的生命感判断；实验不能给出本机电机设置或本机效果大小。'),
      ],
      [
        t('A quick recoil versus a slow approach', '快速缩回与缓慢靠近'),
        t('Position over time, velocity, peak acceleration and path curvature', '位置时间序列、速度、峰值加速度与路径曲率'),
        t('[2] Saerbeck & Bartneck (2010): acceleration and curvature affected perceived affect in their robot experiment. Applying those dimensions here is a design inference, not proof that a given action communicates fear or warmth.', '[2] Saerbeck 与 Bartneck（2010）：其机器人实验发现加速度与曲率影响情绪感知；在本机记录这些量是设计推断，不能据此宣称某动作已传达害怕或热情。'),
      ],
      [
        t('A response that follows a person’s action', '人做出动作之后的回应'),
        t('Input timestamp → command start → physical motion onset; three distinct times', '输入时刻 → 指令起动 → 物理动作起动，分别记录三个时刻'),
        t('[3] Shiwa et al. (2009): preferred response time peaked around 1 s in a conversational robot task. This is not a universal delay for touch, startle or this device.', '[3] Shiwa 等（2009）：语言交互机器人任务中，偏好在约 1 s 响应处最高；不能推广成触摸、惊跳或本装置的通用延迟。'),
      ],
      [
        t('A tendon wraps and holds', '肌腱缠绕与保持'),
        t('Requested and measured take-up in mm; tension in N only with calibrated sensing', '目标与实测收线 mm；只有经标定的传感才能给出张力 N'),
        t('[4] Kato et al.: tendon friction dominated hysteresis in their continuum robot. Length, posture and force are distinct quantities; their numerical errors do not transfer to this machine.', '[4] Kato 等：其连续体机器人实验中肌腱摩擦是滞回的主要因素；收线、姿态和力须分开，其误差数值不能移植为本机误差。'),
      ],
      [
        t('Command a position servo', '给位置舵机下指令'),
        t('Model angle in degrees → calibrated pulse width in μs; measured position is separate', '模型角度 ° → 经标定的脉宽 μs；真实位置另记'),
        t('[5] Arduino Servo: writeMicroseconds sets a command; read returns the last setpoint, not measured orientation. Common pulse endpoints are examples, not this servo’s calibration. Continuous-rotation servos have different command semantics.', '[5] Arduino Servo：writeMicroseconds 写命令，read 返回最后设定角而非实测位置；常见脉宽端点只是示例，不能充当本机标定。连续旋转舵机的命令含义不同。'),
      ],
      [
        t('Emit sound', '发声'),
        t('On/off duration, pitch in Hz and a separate level command', '开/关时长、音高 Hz，与单独的音量命令'),
        t('[6] Arduino tone outputs a 50% duty square wave with frequency and optional duration; it has no independent volume argument. The engine’s sounding-time fraction is not electrical PWM duty or dB SPL.', '[6] Arduino tone 按频率和可选时长产生 50% 占空比方波，没有独立音量参数；引擎的发声时间占比不等于电气 PWM 占空比，也不等于 dB 声压。'),
      ],
      [
        t('Dim the proposed WS2812B ring', '调节拟用的 WS2812B 灯环'),
        t('Brightness command → per-pixel RGB values, then digital data frames', '亮度命令 → 每灯 RGB 数值 → 数字数据帧'),
        t('[7] Worldsemi datasheet: each pixel receives 24-bit GRB data over a timed single-wire protocol. The recorded 12-pixel ring needs that protocol, not analogWrite duty. Confirm the actual revision, colour policy and brightness calibration.', '[7] Worldsemi 数据手册：每灯通过有时序要求的单线协议接收 24-bit GRB 数据；档案中的 12 灯环需要数字协议，不能直接写 analogWrite 占空比。芯片版本、颜色策略与亮度标定仍需确认。'),
      ],
    ],
    caption: t(
      `Research and interface boundaries. These sources guide which motion features to preserve and how commands are encoded. They do not validate perceived personality in this device, calibrate its actuators, or turn simulation values into measurements. Sources checked 2026-10-25; [7] is the manufacturer datasheet hosted by Adafruit.\n${sources}`,
      `研究与接口边界。文献帮助确定应保留哪些动作特征，接口资料说明命令怎样编码；两者均不能证明本机已产生人格感知、替本机完成执行器标定，或把仿真值变成实测值。来源核对于 2026-10-25；[7] 为 Adafruit 托管的原厂数据手册。\n${sources}`,
    ),
  },
];
