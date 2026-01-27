import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

export type BodyScope = 'head' | 'torso' | 'full';

interface BodyScopeSelectorProps {
    value: BodyScope | null;
    onChange: (scope: BodyScope) => void;
    disabled?: boolean;

    /** Optional behavior controls */
    allowedScopes?: BodyScope[];           // per-style locks
    defaultScope?: BodyScope | null;        // per-style defaults
}

import { User, Shirt, Users, Shield } from 'lucide-react';

const OPTIONS = [
    { id: 'head', label: 'Head', hint: 'Face & identity only', Icon: User },
    { id: 'torso', label: 'Torso', hint: 'Upper body framing', Icon: Shirt },
    { id: 'full', label: 'Full Body', hint: 'Complete figure', Icon: Users },
] as const;

export default function BodyScopeSelector({
    value,
    onChange,
    disabled = false,
    allowedScopes,
    defaultScope = null,
}: BodyScopeSelectorProps) {
    /** Apply default scope once when available */
    useEffect(() => {
        if (!value && defaultScope && (!allowedScopes || allowedScopes.includes(defaultScope))) {
            onChange(defaultScope);
        }
    }, [value, defaultScope, allowedScopes, onChange]);

    return (
        <div
            className="flex flex-col items-center gap-8"
            role="group"
            aria-label="Body Scope Selection"
            aria-disabled={disabled}
        >
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted text-center">
                Body Scope (Required)
            </div>

            <div className="flex gap-6">
                {OPTIONS.map(({ id, label, hint, Icon }) => {
                    const selected = value === id;
                    const locked = allowedScopes && !allowedScopes.includes(id);

                    return (
                        <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={label}
                            // Remove disabled attribute to allow hover events
                            aria-disabled={disabled || locked}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => {
                                if (disabled) return;
                                if (locked) return; // Prevent click but allow hover
                                onChange(id);
                            }}
                            onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ' ') && !locked && !disabled) {
                                    e.preventDefault();
                                    onChange(id);
                                }
                            }}
                            className={`
                relative w-24 h-24 rounded-full border group
                flex flex-col items-center justify-center gap-2
                transition-all duration-300 outline-none
                ${locked
                                    ? 'cursor-not-allowed border-border/50 bg-black/20'
                                    : selected
                                        ? 'border-accent'
                                        : 'border-border bg-surface hover:border-accent/50'
                                }
              `}
                        >
                            {/* Animated Selection Ring */}
                            <AnimatePresence>
                                {selected && (
                                    <motion.div
                                        layoutId="body-scope-ring"
                                        initial={{ opacity: 0, scale: 0.85 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                                        className="absolute inset-0 rounded-full border-2 border-accent
                      shadow-[0_0_30px_rgba(250,204,21,0.55)]"
                                    />
                                )}
                            </AnimatePresence>

                            {/* Idle pulse when selectable but not chosen */}
                            {!value && !locked && !disabled && (
                                <motion.div
                                    className="absolute inset-0 rounded-full"
                                    animate={{ opacity: [0.15, 0.35, 0.15] }}
                                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                                />
                            )}

                            {/* Locked Overlay - Appears inside button on hover */}
                            {locked && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 z-50">
                                    <Shield className="w-5 h-5 text-red-500 mb-1" />
                                    <span className="text-[7px] font-black text-red-500 uppercase tracking-widest leading-tight text-center">
                                        Style<br />Locked
                                    </span>
                                </div>
                            )}

                            <Icon
                                className={`w-8 h-8 relative z-10 bodyIcon ${selected ? 'active' : ''} ${locked ? 'opacity-40 group-hover:opacity-0 transition-opacity' : ''}`}
                            />

                            <span className={`text-[9px] font-bold uppercase tracking-widest relative z-10 ${locked ? 'opacity-40 group-hover:opacity-0 transition-opacity' : ''}`}>
                                {label}
                            </span>

                            {/* Standard Hint only (Locked msg is now internal) */}
                            {!locked && (
                                <span className="absolute bottom-[-18px] text-[8px] text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                                    {hint}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
