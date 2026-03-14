
import React from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
 children: React.ReactNode;
 className?: string;
 intensity?: "low" | "medium" | "high";
}

export function GlassCard({ children, className = "", intensity = "medium", ...props }: GlassCardProps) {
 const intensityMap = {
 low: "bg-black/20 backdrop-blur-sm border-white/5",
 medium: "bg-black/40 backdrop-blur-md border-white/10",
 high: "bg-black/60 backdrop-blur-xl border-white/20",
 };

 return (
 <div
 className={`rounded-2xl border isolate ${intensityMap[intensity]} ${className}`}
 {...props}
 >
 {children}
 </div>
 );
}
