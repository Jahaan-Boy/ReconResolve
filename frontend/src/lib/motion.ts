/** Smooth "expo-out" curve used across the site for a consistent feel. */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Soft spring for pointer-linked effects (tilt, magnetic). */
export const SPRING_SOFT = { stiffness: 160, damping: 20, mass: 0.5 } as const;