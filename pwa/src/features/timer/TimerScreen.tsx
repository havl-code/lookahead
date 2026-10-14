import { Preview } from '../../app/Preview.tsx';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';

export function TimerScreen() {
  return (
    <>
      <ScreenHeader title="Timer" />
      <Preview>
        The timer, with scrambles, inspection, and penalties, follows the WCA rules as the desktop
        app does.
      </Preview>
    </>
  );
}
