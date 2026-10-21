import { addPngText, formatPaise, SAMPLE_PAYMENT_KEY, type SamplePayment } from '@nocap/shared';

export interface Sample {
  id: string;
  label: string;
  note: string;
  /** What the mock reader will find. Absent: a screenshot it can't read. */
  payment?: Omit<SamplePayment, 'paidAt'>;
}

/** Each new payment gets a fresh UPI ref, so a sample can be saved more than once. */
const newRef = () =>
  `5${Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('')}`;

export const SAMPLES: Sample[] = [
  {
    id: 'caterers',
    label: 'Paid ₹2,400 to Sri Ganesh Caterers',
    note: 'A new payment',
    payment: { amountPaise: 240000, direction: 'out', counterparty: 'Sri Ganesh Caterers' },
  },
  {
    id: 'fee',
    label: 'Received ₹500 from Arjun Rao',
    note: 'A member’s fee: the bot asks Arjun to confirm it',
    payment: { amountPaise: 50000, direction: 'in', counterparty: 'Arjun Rao' },
  },
  {
    id: 'decor',
    label: 'Paid ₹1,200 to Decor Shop',
    note: 'Already in the Freshers ledger',
    payment: {
      amountPaise: 120000,
      direction: 'out',
      counterparty: 'Decor Shop',
      txnId: '512014334210',
    },
  },
  {
    id: 'blurry',
    label: 'A blurry screenshot',
    note: 'The reader can’t make it out, so the bot asks for the details',
  },
];

const W = 360;
const H = 640;
const FONT = '"Anek Latin Variable", system-ui, sans-serif';
const when = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Draws a generic UPI receipt (no real app's branding) and stores the payment in a PNG text
 * chunk, which is what the mock reader looks at. v0.5 swaps the mock for an AI model that
 * reads the pixels instead.
 */
export async function sampleFile(sample: Sample): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const now = new Date();
  const payment: SamplePayment | undefined = sample.payment && {
    ...sample.payment,
    txnId: sample.payment.txnId ?? newRef(),
    paidAt: now.toISOString(),
  };

  g.fillStyle = '#f4f6fa';
  g.fillRect(0, 0, W, H);
  const accent = payment?.direction === 'in' ? '#17794a' : '#2c3e9e';
  g.fillStyle = accent;
  g.fillRect(0, 0, W, 210);

  // Tick in a circle
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(W / 2, 70, 28, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(W / 2 - 12, 71);
  g.lineTo(W / 2 - 3, 80);
  g.lineTo(W / 2 + 13, 61);
  g.stroke();

  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = `600 18px ${FONT}`;
  g.fillText(payment?.direction === 'in' ? 'Payment received' : 'Payment successful', W / 2, 128);
  g.font = `700 46px ${FONT}`;
  g.fillText(payment ? formatPaise(payment.amountPaise) : '₹ - - -', W / 2, 180);

  const rows: [string, string][] = payment
    ? [
        [payment.direction === 'in' ? 'Received from' : 'Paid to', payment.counterparty],
        ['Date and time', when.format(now)],
        ['UPI transaction ID', payment.txnId!],
        ['Status', 'Completed'],
      ]
    : [
        ['Paid to', '▒▒▒▒▒▒▒▒▒▒'],
        ['Date and time', '▒▒ ▒▒▒ ▒▒▒▒'],
        ['UPI transaction ID', '▒▒▒▒▒▒▒▒▒▒▒▒'],
      ];
  g.textAlign = 'left';
  rows.forEach(([label, value], i) => {
    const y = 260 + i * 78;
    g.fillStyle = '#565c78';
    g.font = `500 15px ${FONT}`;
    g.fillText(label, 28, y);
    g.fillStyle = '#1f2440';
    g.font = `650 21px ${FONT}`;
    g.fillText(value, 28, y + 28);
    g.fillStyle = '#d5dceb';
    g.fillRect(28, y + 46, W - 56, 1);
  });

  g.textAlign = 'center';
  g.fillStyle = '#8a8fa8';
  g.font = `500 13px ${FONT}`;
  g.fillText('Sample screenshot for the NoCap chat simulator', W / 2, H - 28);

  if (!payment) {
    // Smear it, like a photo taken in a hurry.
    g.filter = 'blur(5px)';
    g.drawImage(canvas, 0, 0);
    g.filter = 'none';
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not draw the sample'))),
      'image/png',
    ),
  );
  let bytes = new Uint8Array(await blob.arrayBuffer());
  if (payment) bytes = addPngText(bytes, SAMPLE_PAYMENT_KEY, JSON.stringify(payment));
  return new File([bytes], `${sample.id}-screenshot.png`, { type: 'image/png' });
}
