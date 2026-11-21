import { useNavigate } from 'react-router-dom';
import type { Kurus } from '../../lib/money';
import { useData } from '../../state/data';
import { Button, Notice } from '../../ui';

/**
 * Big purchases are paid by credit card and only show up once the card spending is entered.
 * When a period has sales but no card spending at all, profit looks far better than it is — say so.
 */
export function CardExpenseHint({ from, to, netSales }: { from: string; to: string; netSales: Kurus }) {
  const d = useData();
  const navigate = useNavigate();
  const cards = d.accounts.filter((a) => a.kind === 'card' && !a.archived);
  if (!cards.length || netSales <= 0) return null;
  const cardIds = new Set(cards.map((c) => c.id));
  const hasCardSpending = d.txns.some((t) => t.date >= from && t.date <= to && t.postings.some((p) => cardIds.has(p.accountId) && p.amount < 0));
  if (hasCardSpending) return null;
  return (
    <Notice
      tone="info"
      action={
        <Button size="sm" onClick={() => navigate(`/hesaplar/${cards[0].id}/ekstre`)}>
          Ekstre ile doldur
        </Button>
      }
    >
      Bu dönem için kredi kartı harcaması girilmedi. Büyük alımlar kartla yapıldığı için malzeme maliyeti düşük, kâr olduğundan yüksek görünüyor. Kart ekstresini girince rakamlar düzelir.
    </Notice>
  );
}
