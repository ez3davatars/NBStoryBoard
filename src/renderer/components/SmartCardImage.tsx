import React, { useState, useEffect } from 'react';

interface SmartCardImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackToPlaceholder?: boolean;
}

export function SmartCardImage({
  src,
  alt,
  className = '',
  style,
  fallbackToPlaceholder = true,
}: SmartCardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  // Reset loaded status if src changes
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  // Check if image is already loaded from cache
  useEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none" style={style}>
      {fallbackToPlaceholder && !loaded && (
        <div className="smart-card-image-placeholder absolute inset-0 z-10" />
      )}

      {src ? (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="eager"
          decoding="async"
          className={`smart-card-image w-full h-full object-cover transition-opacity duration-220 ease-in-out ${className} ${loaded ? 'opacity-100' : 'opacity-0'}`}
          data-loaded={loaded ? 'true' : 'false'}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      ) : null}
    </div>
  );
}
