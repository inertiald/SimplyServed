import { ExternalLink, Smartphone, BadgeCheck } from "lucide-react";
import type { PriceComparisonRow } from "@/lib/scrapers/pricing";
import { formatPrice } from "@/lib/scrapers/pricing";

/**
 * Cross-channel price comparison table.
 *
 * Renders the sorted, deep-linked rows produced by `comparisonRows()`. Each row
 * exposes two ways to act on the price: a primary CTA that opens the channel's
 * native app via its deep link (with the https page as the href fallback the
 * browser uses when the app isn't installed), and a small web-page link. The
 * cheapest available price is badged so a consumer can pick the best deal at a
 * glance.
 *
 * Pure presentation — all link/sort logic lives in `lib/deeplinks` +
 * `lib/scrapers/pricing` so it stays unit tested.
 */
export function PriceComparisonTable({
  rows,
  businessName,
}: {
  rows: PriceComparisonRow[];
  businessName: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="ss-card mt-6 overflow-hidden p-0">
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-white">Compare prices</h2>
          <p className="text-xs text-white/50">
            Advertised across channels for {businessName}. Tap to order or book
            via your preferred method.
          </p>
        </div>
        <span className="ss-chip whitespace-nowrap">{rows.length} options</span>
      </header>

      <ul className="divide-y divide-white/5">
        {rows.map((row, i) => (
          <li
            key={`${row.channel}-${row.label}-${i}`}
            className="flex flex-wrap items-center gap-3 px-5 py-4 sm:flex-nowrap"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {row.channelLabel}
                </span>
                {row.cheapest && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                    <BadgeCheck size={12} /> Best price
                  </span>
                )}
                {!row.available && (
                  <span className="ss-chip text-[11px] text-white/50">
                    Unavailable
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-white/55">{row.label}</p>
            </div>

            <div className="text-right">
              <div className="text-lg font-semibold text-white">
                {formatPrice(row.amount, row.currency)}
              </div>
              {row.unit ? (
                <div className="text-[11px] text-white/45">{row.unit}</div>
              ) : row.premiumPct > 0 ? (
                <div className="text-[11px] text-white/45">
                  +{row.premiumPct}% vs best
                </div>
              ) : null}
            </div>

            {row.link.webUrl ? (
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <a
                  href={row.link.appUrl || row.link.webUrl}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="ss-btn-primary flex-1 whitespace-nowrap px-3 py-2 text-xs sm:flex-none"
                >
                  <Smartphone size={14} /> {row.link.action} on {row.channelLabel}
                </a>
                <a
                  href={row.link.webUrl}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  aria-label={`Open ${row.channelLabel} in browser`}
                  className="ss-btn-ghost px-2.5 py-2 text-xs"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            ) : (
              <span className="text-[11px] text-white/40">No link</span>
            )}
          </li>
        ))}
      </ul>

      <footer className="border-t border-white/5 px-5 py-3 text-[11px] text-white/40">
        Prices are aggregated from public storefront data and may change. You
        complete checkout on the selected channel.
      </footer>
    </section>
  );
}
