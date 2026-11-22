import { memo, useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';

interface ArtworkProps {
  src?: string;
  alt: string;
  className?: string;
  rounded?: string;
  thumb?: boolean;
}

function optimizeThumbSrc(src?: string, thumb?: boolean): string | undefined {
  if (!src || !thumb) return src;
  return src
    .replace(/\/600x600bb\.(jpg|jpeg|png|webp)/i, '/200x200bb.$1')
    .replace(/=w544-h544-l90-rj/i, '=w226-h226-l90-rj');
}

export const Artwork = memo(function Artwork({
  src,
  alt,
  className = 'w-12 h-12',
  rounded = 'rounded-lg',
  thumb = false,
}: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const resolvedSrc = optimizeThumbSrc(src, thumb);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [resolvedSrc]);

  const showFallback = !resolvedSrc || failed;

  return (
    <div
      className={`relative overflow-hidden shrink-0 bg-zinc-200 dark:bg-zinc-800/90 ${rounded} ${className}`}
    >
      {showFallback ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-800 dark:to-zinc-900 text-zinc-500 dark:text-zinc-400">
          <Disc3 className="w-1/2 h-1/2 stroke-[1.5]" />
        </div>
      ) : (
        <img
          src={resolvedSrc}
          alt={alt}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
});
