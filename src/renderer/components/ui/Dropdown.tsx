import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import { autoUpdate, computePosition, offset, flip, shift, size } from "@floating-ui/dom";

export type DropdownOption =
    | { type: "group"; label: string }
    | { type: "option"; label: string; value: string; disabled?: boolean; onDelete?: () => void };

interface DropdownProps {
    value: string;
    options: DropdownOption[];
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export function Dropdown({ value, options, onChange, placeholder = "Select...", className = "", forceUpward = false, closeOnMouseLeave = false, variant = "default", disabled = false }: DropdownProps & { forceUpward?: boolean; closeOnMouseLeave?: boolean; variant?: "default" | "render" }) {
    const [isOpen, setIsOpen] = useState(false);
    const [animateClass, setAnimateClass] = useState("opacity-0 translate-y-1");

    // Unique ID for this dropdown instance to manage single-open state
    const id = React.useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const cleanupRef = useRef<null | (() => void)>(null);
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Global listener for closing other dropdowns
    useEffect(() => {
        const handleOpenEvent = (e: CustomEvent) => {
            if (e.detail?.id !== id) {
                setIsOpen(false);
            }
        };

        window.addEventListener("dropdown-open", handleOpenEvent as EventListener);
        return () => window.removeEventListener("dropdown-open", handleOpenEvent as EventListener);
    }, [id]);

    // Handle Open/Close Logic & Animation
    useEffect(() => {
        if (isOpen && triggerRef.current) {
            // Notify others to close
            window.dispatchEvent(new CustomEvent("dropdown-open", { detail: { id } }));

            // Trigger animation frame
            requestAnimationFrame(() => {
                setAnimateClass("opacity-100 translate-y-0");
            });
        } else {
            // Reset animation state when closed
            setAnimateClass("opacity-0 translate-y-1");

            // Clear timeout if closed manually
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
            }
        }
    }, [isOpen, id]);

    // Floating UI Positioning
    const updatePosition = async () => {
        const ref = triggerRef.current;
        const floating = menuRef.current;
        if (!ref || !floating) return;

        const { x, y } = await computePosition(ref, floating, {
            placement: forceUpward ? "top-start" : "bottom-start",
            strategy: "fixed",
            middleware: [
                offset(6),
                flip(),
                shift({ padding: 8 }),
                size({
                    apply({ rects, elements }) {
                        Object.assign(elements.floating.style, {
                            minWidth: `${rects.reference.width}px`,
                        });
                    },
                }),
            ],
        });

        Object.assign(floating.style, {
            position: "fixed",
            left: `${x}px`,
            top: `${y}px`,
            zIndex: "9999",
        });
    };

    useLayoutEffect(() => {
        if (!isOpen) return;

        // Ensure portal has mounted
        requestAnimationFrame(() => {
            updatePosition();
            const ref = triggerRef.current;
            const floating = menuRef.current;
            if (!ref || !floating) return;

            cleanupRef.current = autoUpdate(ref, floating, updatePosition);
        });

        return () => {
            cleanupRef.current?.();
            cleanupRef.current = null;
        };
    }, [isOpen, forceUpward]);

    // Close on outside click, Escape, & scroll out of view
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
                const target = e.target as HTMLElement;
                const isMenuClick = target.closest('.dropdown-portal-menu');
                if (!isMenuClick) {
                    setIsOpen(false);
                }
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);

        // Auto-close if trigger scrolls entirely out of viewport
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting && isOpen) {
                    setIsOpen(false);
                }
            }
        }, { threshold: 0 });

        if (triggerRef.current) {
            observer.observe(triggerRef.current);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
            observer.disconnect();
        };
    }, [isOpen]);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    const handleMouseEnter = () => {
        if (!closeOnMouseLeave) return;
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    };

    const handleMouseLeave = () => {
        if (!closeOnMouseLeave) return;
        closeTimeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 150);
    };

    const selectedOption = options.find((opt): opt is Extract<DropdownOption, { type: "option" }> =>
        opt.type === "option" && opt.value === value
    );

    const isRenderVariant = variant === "render";

    const menuClasses = isRenderVariant
        ? `dropdown-portal-menu bg-[#11141c] border border-yellow-500/30 shadow-2xl ring-1 ring-yellow-500/20 rounded-xl flex flex-col p-2 
           transition-all duration-150 ease-out scrollbar-none relative overflow-hidden ${animateClass}`
        : `dropdown-portal-menu bg-[#0f1117] border border-white/10 rounded-xl shadow-2xl flex flex-col p-1 
           transition-all duration-150 ease-out scrollbar-none ${animateClass}`;

    const Menu = (
        <div
            ref={menuRef}
            style={{ maxHeight: "280px", overflowY: "auto", overscrollBehavior: "contain" }}
            className={menuClasses}
            onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking scrollbar or empty space in menu
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {isRenderVariant && (
                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-yellow-500/40 pointer-events-none" />
            )}

            {options.map((option, index) => {
                if (option.type === "group") {
                    return (
                        <div
                            key={`group-${index}`}
                            className={`text-xs font-bold uppercase tracking-widest px-3 py-2 mt-4 first:mt-0 select-none
                                ${isRenderVariant ? "text-white/60 mt-6" : "text-white/40"}
                            `}
                        >
                            {option.label}
                        </div>
                    );
                }

                const isSelected = option.value === value;
                return (
                    <div key={option.value} className="relative group">
                        <button
                            onClick={() => !option.disabled && handleSelect(option.value)}
                            disabled={option.disabled}
                            className={`text-left text-xs px-4 py-2 rounded-md transition-colors flex items-center justify-between w-full shrink-0
                                ${isSelected ? "bg-yellow-500/10 text-yellow-500" : "text-gray-300 hover:bg-white/5 hover:text-white"}
                                ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}
                            `}
                        >
                            <span className="truncate pr-6">{option.label}</span>
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0" />}
                        </button>
                        {option.onDelete && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    option.onDelete?.();
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-red-500 hover:bg-white/10 rounded-md opacity-0 group-hover:opacity-100 transition-all z-10"
                                title="Delete Preset"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );

    return (
        <>
            <button
                ref={triggerRef}
                onClick={(e) => {
                    if (disabled) return;
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                disabled={disabled}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`w-full bg-[#0f1117] text-white border rounded-xl px-3 py-2 text-xs 
                flex items-center justify-between transition-all focus:outline-none
                ${isOpen
                        ? "border-yellow-500 ring-1 ring-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]"
                        : "border-white/10 hover:border-white/20"} 
                ${disabled ? "opacity-40 cursor-not-allowed grayscale-[0.5]" : ""}
                ${className}`}
            >
                <span className="truncate mr-2 opacity-90">
                    {selectedOption ? selectedOption.label : <span className="text-gray-500">{placeholder}</span>}
                </span>
                <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                >
                    <path d="M1 1L5 5L9 1" stroke="#eab308" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {isOpen && ReactDOM.createPortal(Menu, document.body)}
        </>
    );
}
