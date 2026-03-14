import { useState, useEffect, useRef } from 'react';

// --- HSL Helpers ---
function HexToHSL(hex: string): { h: number; s: number; l: number } {
 hex = hex.replace(/^#/, '');
 if (hex.length === 3) hex = hex.split('').map(s => s + s).join('');
 const r = parseInt(hex.substring(0, 2), 16) / 255;
 const g = parseInt(hex.substring(2, 4), 16) / 255;
 const b = parseInt(hex.substring(4, 6), 16) / 255;
 const max = Math.max(r, g, b), min = Math.min(r, g, b);
 let h = 0, s, l = (max + min) / 2;
 if (max === min) h = s = 0;
 else {
 const d = max - min;
 s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
 switch (max) {
 case r: h = (g - b) / d + (g < b ? 6 : 0); break;
 case g: h = (b - r) / d + 2; break;
 case b: h = (r - g) / d + 4; break;
 }
 h /= 6;
 }
 return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function HSLToHex(h: number, s: number, l: number): string {
 s /= 100; l /= 100;
 const k = (n: number) => (n + h / 30) % 12;
 const a = s * Math.min(l, 1 - l);
 const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
 const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
 return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export const DebouncedHueSlider = ({ color, onChange }: { color: string, onChange: (color: string) => void }) => {
 const [localHue, setLocalHue] = useState(HexToHSL(color).h);
 const onChangeRef = useRef(onChange);
 onChangeRef.current = onChange;
 const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

 useEffect(() => {
 const propHue = HexToHSL(color).h;
 if (Math.abs(propHue - localHue) > 5) {
 setLocalHue(propHue);
 }
 }, [color]);

 const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
 const newHue = parseInt(e.target.value);
 setLocalHue(newHue);
 if (timeoutRef.current) clearTimeout(timeoutRef.current);
 timeoutRef.current = setTimeout(() => {
 const hsl = HexToHSL(color);
 const newHex = HSLToHex(newHue, hsl.s, hsl.l);
 onChangeRef.current(newHex);
 }, 50);
 };

 return (
 <input
 type="range"
 min="0"
 max="360"
 value={localHue}
 onChange={handleChange}
 className="w-full h-1 bg-gradient-to-r from-red-500 via-green-500 via-blue-500 to-red-500 rounded-lg appearance-none cursor-pointer"
 title="Adjust Color Hue"
 />
 );
};



