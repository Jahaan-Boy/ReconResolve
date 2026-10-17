import { MotionConfig } from 'motion/react';
import { LandingPage } from '@/features/landing/LandingPage';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <LandingPage />
    </MotionConfig>
  );
}