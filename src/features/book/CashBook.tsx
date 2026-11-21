import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck, CalendarDays, FileSpreadsheet, Share2, Table2 } from 'lucide-react';
import { BOOK_GROUP_LABEL, bookColumns, buildCashBook, groupSpans, type BookCol, type BookGroup, type CashBookFigures, type CashBookRow } from '../../domain/cashBook';
import { formatDate, formatMonth, monthKey, todayISO, weekday } from '../../lib/dates';
import { formatAmountInput, type Kurus } from '../../lib/money';
import { useData } from '../../state/data';
import { Button, Card, EmptyState, Modal, PageHeader, Select, Toggle, cx } from '../../ui';
import { useUI } from '../../state/ui';
import { shareOrDownload, stamp } from '../../lib/share';
import type { CashBook as CashBookData } from '../../domain/cashBook';
import { buildBookWorkbook } from './bookExcel';

type Group = BookGroup;
type Col = BookCol;
const GROUP_LABEL = BOOK_GROUP_LABEL;
const GROUP_TINT: Record<Group, string> = {
  satis: 'bg-sky-50 text-sky-900',
  yemek: 'bg-emerald-50 text-emerald-900',
  ciro: 'bg-amber-50 text-amber-900',
  gider: 'bg-rose-50 text-rose-900',
  sonuc: 'bg-violet-50 text-violet-900',
  kasa: 'bg-ink-100 text-ink-800',
};

const ROW_H = 'h-9';
const cellNum = (v: Kurus) => (v ? formatAmountInput(v) : '');

export function CashBook() {
  const d = useData();
  const navigate = useNavigate();
  const today = todayISO();
  const [month, setMonth] = useState('');
  const [showEmpty, setShowEmpty] = useState(true);
  const [exporting, setExporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const monthRefs = useRef(new Map<string, HTMLTableRowElement>());
  const dayRefs = useRef(new Map<string, HTMLTableRowElement>());

  const book = useMemo(
    () => buildCashBook({ txns: d.txns, dayCloses: d.dayCloses, methods: d.methods, contacts: d.contacts, accounts: d.accounts, today }),
    [d.txns, d.dayCloses, d.methods, d.contacts, d.accounts, today],
  );

  const cols: Col[] = useMemo(() => bookColumns(book.columns), [book.columns]);
  const groups = useMemo(() => groupSpans(cols), [cols]);

  const months = month ? book.months.filter((m) => m.month === month) : book.months;
  const current = book.months.find((m) => m.month === monthKey(today));

  const scrollTo = (el?: HTMLElement) => {
    const box = scrollRef.current;
    if (!box || !el) return;
    box.scrollTop = Math.max(0, el.offsetTop - (headRef.current?.offsetHeight ?? 0));
  };

  // Like the Excel, the sheet is long; open it at the current month.
  useEffect(() => {
    if (!month) scrollTo(monthRefs.current.get(monthKey(today)));
    else if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [month, today, book.months.length]);

  if (!book.months.length) {
    return (
      <>
        <PageHeader title="Kasa defteri" />
        <Card>
          <EmptyState icon={<Table2 className="h-10 w-10" />} title="Henüz kayıt yok" text="Gün sonu girildikçe günlük kasa defteri burada Excel düzeninde oluşur." />
        </Card>
      </>
    );
  }

  const numCell = (v: Kurus, c: Col, strong = false) => (
    <td key={c.key} className={cx('tabular whitespace-nowrap border-b border-r border-ink-200 px-2 text-right', c.computed && 'bg-ink-50', v < 0 && 'text-red-700', strong && 'font-semibold')}>
      {cellNum(v)}
    </td>
  );

  const stickyA = 'sticky left-0 z-[2] w-[92px] min-w-[92px]';
  const stickyB = 'sticky left-[92px] z-[2] w-[52px] min-w-[52px]';

  /** Totals row. With `top` it is frozen at the top of the sheet like the Excel's first rows. */
  const summaryRow = (label: string, f: CashBookFigures, tint: string, extra?: ReactNode, top?: string) => (
    <tr className={cx(ROW_H, 'font-semibold')}>
      <td colSpan={2} className={cx('sticky left-0 w-[144px] min-w-[144px] border-b border-r border-ink-200 px-2 text-[12.5px]', tint, top ? `${top} z-[5]` : 'z-[2]')}>
        <span className="whitespace-nowrap">{label}</span>
      </td>
      {cols.map((c) => {
        const v = c.get(f);
        return (
          <td key={c.key} className={cx('tabular whitespace-nowrap border-b border-r border-ink-200 px-2 text-right', tint, top && `sticky ${top} z-[3]`, v < 0 && 'text-red-700')}>
            {cellNum(v)}
          </td>
        );
      })}
      <td className={cx('whitespace-nowrap border-b border-ink-200 px-2 text-left text-[12px] font-normal text-ink-600', tint, top && `sticky ${top} z-[3]`)}>{extra}</td>
    </tr>
  );

  const dayRow = (r: CashBookRow) => {
    const empty = !r.hasData;
    return (
      <tr
        key={r.date}
        ref={(el) => {
          if (el) dayRefs.current.set(r.date, el);
        }}
        onClick={() => navigate(`/gun-sonu/${r.date}`)}
        className={cx(ROW_H, 'group cursor-pointer', r.date === today && 'outline outline-2 -outline-offset-2 outline-brand-400')}
      >
        <td className={cx(stickyA, 'border-b border-r border-ink-200 bg-white px-2 group-hover:bg-brand-50', empty && 'text-ink-400')}>
          <span className="tabular whitespace-nowrap">{formatDate(r.date, 'numeric')}</span>
        </td>
        <td className={cx(stickyB, 'border-b border-r border-ink-200 bg-white px-1.5 group-hover:bg-brand-50', empty && 'text-ink-400')}>
          <span className="inline-flex items-center gap-1">
            {weekday(r.date, true)}
            {r.status && <span className={cx('h-1.5 w-1.5 rounded-full', r.status === 'closed' ? 'bg-emerald-500' : 'bg-amber-500')} />}
          </span>
        </td>
        {cols.map((c) => (empty ? <td key={c.key} className={cx('border-b border-r border-ink-200 group-hover:bg-brand-50/60', c.computed && 'bg-ink-50')} /> : numCell(c.get(r), c)))}
        <td className="border-b border-ink-200 px-2 group-hover:bg-brand-50/60">
          <span className="line-clamp-1 min-w-[280px] max-w-[520px] text-ink-700" title={r.note}>
            {r.note}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <>
      <PageHeader
        title="Kasa defteri"
        sub="Excel’deki günlük kasa defteri düzeni. Burası yalnızca görüntüleme içindir; kayıtlar Gün sonu ve işlem ekranlarından girilir. Bir güne dokunun, o günün gün sonu açılır."
        actions={
          <>
            <Button icon={<FileSpreadsheet className="h-5 w-5" />} onClick={() => setExporting(true)}>
              Excel’e aktar
            </Button>
            <Link to="/gun-sonu/bugun">
              <Button variant="primary" icon={<CalendarCheck className="h-5 w-5" />}>
                Bugünün gün sonu
              </Button>
            </Link>
          </>
        }
      />
      {exporting && <BookExport book={book} month={month} showEmpty={showEmpty} onClose={() => setExporting(false)} />}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Ay">
            <option value="">Tüm aylar</option>
            {[...book.months].reverse().map((m) => (
              <option key={m.month} value={m.month}>
                {formatMonth(m.month)}
              </option>
            ))}
          </Select>
        </div>
        {!month && (
          <Button icon={<CalendarDays className="h-4 w-4" />} onClick={() => scrollTo(dayRefs.current.get(today) ?? monthRefs.current.get(monthKey(today)))}>
            Bugüne git
          </Button>
        )}
        <Toggle checked={showEmpty} onChange={setShowEmpty} label="Boş günleri göster" />
      </div>

      <div ref={scrollRef} className="card relative max-h-[calc(100dvh-210px)] min-h-[420px] overflow-auto">
        <table className="border-separate border-spacing-0 text-[13px] text-ink-800">
          <thead ref={headRef}>
            {month
              ? summaryRow(formatMonth(month), months[0]?.total ?? book.grand, 'bg-brand-50', `${months[0]?.total.salesDays ?? 0} satış günü`, 'top-0')
              : current && summaryRow('Bu ay', current.total, 'bg-brand-50', `${current.total.salesDays} satış günü`, 'top-0')}
            {summaryRow('Genel toplam', book.grand, 'bg-amber-50', '← tüm ayların toplamı · Kasadaki nakit: şu an kasada olması gereken tutar', 'top-[36px]')}
            <tr className="h-8">
              <th colSpan={2} className={cx('sticky left-0 top-[72px] z-[4] border-b border-r border-ink-200 bg-ink-800 px-2 text-left text-[11px] font-bold tracking-wide text-white')}>
                TARİH
              </th>
              {groups.map((g, i) => (
                <th key={i} colSpan={g.span} className={cx('sticky top-[72px] z-[3] border-b border-r border-ink-200 px-2 text-center text-[11px] font-bold tracking-wide', GROUP_TINT[g.group])}>
                  {GROUP_LABEL[g.group]}
                </th>
              ))}
              <th className="sticky top-[72px] z-[3] border-b border-ink-200 bg-ink-100 px-2 text-left text-[11px] font-bold tracking-wide text-ink-800">AÇIKLAMA</th>
            </tr>
            <tr className="h-12">
              <th className={cx(stickyA, 'top-[104px] z-[4] border-b border-r border-ink-300 bg-white px-2 text-left font-semibold')}>Tarih</th>
              <th className={cx(stickyB, 'top-[104px] z-[4] border-b border-r border-ink-300 bg-white px-1.5 text-left font-semibold')}>Gün</th>
              {cols.map((c) => (
                <th key={c.key} className={cx('sticky top-[104px] z-[3] min-w-[86px] max-w-[120px] border-b border-r border-ink-300 px-2 text-right align-bottom font-semibold leading-tight', c.computed ? 'bg-ink-100' : 'bg-white')}>
                  {c.label}
                </th>
              ))}
              <th className="sticky top-[104px] z-[3] min-w-[280px] border-b border-ink-300 bg-white px-2 text-left align-bottom font-semibold">Açıklama (ne alındı, notlar)</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <Fragment key={m.month}>
                <tr
                  ref={(el) => {
                    if (el) monthRefs.current.set(m.month, el);
                  }}
                  className="h-9"
                >
                  <td colSpan={cols.length + 3} className="border-b border-ink-300 bg-ink-200/70 px-2">
                    <span className="sticky left-2 text-[12px] font-bold uppercase tracking-wider text-ink-800">{formatMonth(m.month)}</span>
                  </td>
                </tr>
                {m.rows.filter((r) => showEmpty || r.hasData).map(dayRow)}
                {summaryRow(`${formatMonth(m.month)} toplamı`, m.total, 'bg-amber-50/70', `${m.total.salesDays} satış günü · Kasadaki nakit = ay sonundaki tutar`)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-4xl text-sm text-ink-500">
        Gri sütunlar otomatik hesaplanır. <b>Masraf</b>: günün bütün giderleri (nasıl ödendiğinden bağımsız). <b>Kasa dışı ödenen gider</b>: kartla, bankadan, veresiye ya da cepten ödenen kısım. <b>Diğer kasa hareketi</b>: kasadan bankaya yatırılan para, borç ödemeleri, tahsilatlar gibi. <b>Nakitten kalan</b>: o gün kasadaki paranın değişimi. Yeşil nokta: gün kapandı · turuncu: açık.
      </p>
    </>
  );
}

function BookExport({ book, month, showEmpty, onClose }: { book: CashBookData; month: string; showEmpty: boolean; onClose: () => void }) {
  const d = useData();
  const { toast } = useUI();
  const [busy, setBusy] = useState<'detailed' | 'summary' | null>(null);
  const [ready, setReady] = useState<{ blob: Blob; name: string } | null>(null);

  const make = async (kind: 'detailed' | 'summary') => {
    setBusy(kind);
    try {
      const blob = await buildBookWorkbook(book, {
        kind,
        month: kind === 'detailed' && month ? month : undefined,
        showEmpty,
        today: todayISO(),
        businessName: (d.settings.businessName as string) || "Mama's Burger",
      });
      const scope = kind === 'detailed' && month ? `_${month}` : '';
      setReady({ blob, name: `mamas-burger_kasa-defteri_${kind === 'detailed' ? 'detayli' : 'ozet'}${scope}_${stamp()}.xlsx` });
    } catch (e) {
      toast('Excel hazırlanamadı: ' + (e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const option = (kind: 'detailed' | 'summary', title: string, text: string) => (
    <button
      onClick={() => make(kind)}
      disabled={busy !== null}
      className="flex w-full items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left transition hover:border-ink-300 active:bg-ink-50 disabled:opacity-60"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
        <FileSpreadsheet className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-semibold text-ink-900">{busy === kind ? 'Hazırlanıyor…' : title}</span>
        <span className="mt-0.5 block text-sm leading-snug text-ink-500">{text}</span>
      </span>
    </button>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Kasa defterini Excel’e aktar"
      footer={
        ready ? (
          <>
            <Button onClick={() => setReady(null)}>Geri</Button>
            <Button
              variant="primary"
              icon={<Share2 className="h-4 w-4" />}
              onClick={async () => {
                await shareOrDownload(ready.blob, ready.name);
                onClose();
              }}
            >
              Kaydet / paylaş
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Vazgeç</Button>
        )
      }
    >
      {ready ? (
        <div className="space-y-2 text-[15px] text-ink-700">
          <p>
            Dosya hazır: <b className="break-all">{ready.name}</b>
          </p>
          <p className="text-sm text-ink-500">“Kaydet / paylaş”a dokunun. iPad’de “Dosyalara Kaydet”i ya da WhatsApp, e-posta gibi bir uygulamayı seçebilirsiniz.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {option(
            'detailed',
            'Detaylı (gün gün)',
            `Eski Excel’deki “Günlük Kasa” sayfası: her gün bir satır, aylara göre bölümler ve ay toplamları. İkinci sayfada aylık özet. ${month ? `Yalnızca ${formatMonth(month)}.` : 'Bütün aylar.'}`,
          )}
          {option('summary', 'Özet (aylık)', 'Her ay bir satır: ay toplamları, satış günü, günlük ortalama ciro; en altta genel toplam.')}
        </div>
      )}
    </Modal>
  );
}
