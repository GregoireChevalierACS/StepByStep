import type { Distance } from '../model/Distance';

/** Façon d'estimer la longueur d'un pas, pour convertir des pas en distance. */
export interface StrideLengthStrategy {
  strideLength(): Distance;
}

/** Longueur de pas saisie par l'utilisateur. */
export class FixedStrideLength implements StrideLengthStrategy {
  constructor(private readonly stride: Distance) {}

  strideLength(): Distance {
    return this.stride;
  }
}

// Approximation courante pour la marche : longueur de pas ≈ taille × 0,415.
const STRIDE_TO_HEIGHT_RATIO = 0.415;

/** Longueur de pas déduite de la taille de l'utilisateur. */
export class HeightBasedStrideLength implements StrideLengthStrategy {
  constructor(private readonly height: Distance) {}

  strideLength(): Distance {
    return this.height.scaledBy(STRIDE_TO_HEIGHT_RATIO);
  }
}
