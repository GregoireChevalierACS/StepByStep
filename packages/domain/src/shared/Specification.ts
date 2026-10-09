/** Règle métier composable : un prédicat sur un candidat, combinable avec and / or / not. */
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
  and(other: Specification<T>): Specification<T>;
  or(other: Specification<T>): Specification<T>;
  not(): Specification<T>;
}

export const specification = <T>(predicate: (candidate: T) => boolean): Specification<T> => ({
  isSatisfiedBy: predicate,
  and: (other) =>
    specification((candidate) => predicate(candidate) && other.isSatisfiedBy(candidate)),
  or: (other) =>
    specification((candidate) => predicate(candidate) || other.isSatisfiedBy(candidate)),
  not: () => specification((candidate) => !predicate(candidate)),
});
