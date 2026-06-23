import { useNavigate } from 'react-router-dom';

import { fireAchievementConfetti } from '../achievements/confetti';
import { useKonamiCode } from './useKonamiCode';

// Mounted once at the app root. Listens for the Konami code anywhere in the app
// and, on success, fires a confetti burst and whisks the user to the hidden
// "19th hole" credits page. Renders nothing.
export function KonamiListener() {
  const navigate = useNavigate();

  useKonamiCode(() => {
    fireAchievementConfetti();
    navigate('/secret');
  });

  return null;
}
