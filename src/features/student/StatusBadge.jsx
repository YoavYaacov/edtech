import Badge from '../../components/ui/Badge';
import { studentMap as m } from '../../i18n/he';

const tones = { not_learned: 'neutral', learning: 'butter', learned: 'mint' };

export default function StatusBadge({ status }) {
  return <Badge tone={tones[status] ?? 'neutral'}>{m.status[status] ?? m.status.not_learned}</Badge>;
}
