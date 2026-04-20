import Link from "next/link";
import { MapPin, Heart, Briefcase } from "lucide-react";

export interface ListingCardData {
  id: string;
  title: string;
  description: string;
  category: string;
  hourlyRate: number;
  provider: { name: string; avatarUrl: string | null };
  _count?: { impressions: number; requests: number };
}

export function ListingCard({ listing }: { listing: ListingCardData }) {
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="ss-card group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="ss-chip">
          <Briefcase size={12} />
          {listing.category}
        </span>
        <div className="text-right">
          <div className="text-lg font-semibold text-white">${listing.hourlyRate}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/50">/ hr</div>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-white group-hover:text-indigo-300">
          {listing.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-white/60">{listing.description}</p>
      </div>

      <div className="mt-auto flex items-center justify-between text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <MapPin size={12} /> {listing.provider.name}
        </span>
        {listing._count && (
          <span className="flex items-center gap-1.5">
            <Heart size={12} /> {listing._count.impressions}
          </span>
        )}
      </div>
    </Link>
  );
}
