import type { EntryDTO, PersonRef } from '@nocap/shared';
import { useAuth } from '../auth';
import { formatTimestamp } from '../format';
import { Icon } from './icons';

/** One line saying whether an entry has been checked, and by whom or by whom it still must be. */
export function VerificationLine({ entry }: { entry: EntryDTO }) {
  const { member } = useAuth();
  const name = (p?: PersonRef) => (p && p.id === member?.id ? 'you' : p?.name);
  const v = entry.verification;

  if (v.state === 'verified') {
    return (
      <p className="check check-ok">
        <Icon name="check" />
        <span>
          Verified by {name(v.by)}
          {v.at && <span className="check-when">, {formatTimestamp(v.at)}</span>}
        </span>
      </p>
    );
  }
  if (v.state === 'disputed') {
    return (
      <p className="check check-disputed">
        <Icon name="alert" />
        <span>
          Disputed by {name(v.by)}: {v.note}
        </span>
      </p>
    );
  }
  let text = 'Waiting for another admin to check';
  if (v.needsProof) text = 'Needs a bill before it can be verified';
  else if (v.confirmer) text = `Waiting for ${name(v.confirmer)} to confirm`;
  return (
    <p className="check check-waiting">
      <Icon name="circle" />
      <span>{text}</span>
    </p>
  );
}
