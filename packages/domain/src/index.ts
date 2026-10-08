export { DailyActivity } from './model/DailyActivity';
export { DailyGoal } from './model/DailyGoal';
export { Distance } from './model/Distance';
export type { InvalidDistance } from './model/Distance';
export type { InvalidDailyGoal } from './model/DailyGoal';
export { LocalDate } from './model/LocalDate';
export type { InvalidLocalDate } from './model/LocalDate';
export { StepCount } from './model/StepCount';
export type { NegativeStepCount, NonIntegerStepCount, StepCountError } from './model/StepCount';
export { StepCounterReading } from './model/StepCounterReading';
export type {
  InvalidBootCount,
  InvalidStepsSinceBoot,
  InvalidTakenAt,
  StepCounterReadingError,
} from './model/StepCounterReading';
export type { LocalCalendar } from './ports/LocalCalendar';
export { computeStreak } from './services/computeStreak';
export { distributeStepsByDay } from './services/distributeStepsByDay';
export { FixedStrideLength, HeightBasedStrideLength } from './services/StrideLengthStrategy';
export type { StrideLengthStrategy } from './services/StrideLengthStrategy';
export type { DailySteps, ReadingsOutOfOrder } from './services/distributeStepsByDay';
export { err, ok } from './shared/Result';
export type { Err, Ok, Result } from './shared/Result';
