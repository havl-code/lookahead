import { Preview } from '../../app/Preview.tsx';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';

export function SessionsScreen() {
  return (
    <>
      <ScreenHeader title="Sessions" />
      <Preview>Your sessions and solves, with Ao5, Ao12, and your cubes.</Preview>
    </>
  );
}
