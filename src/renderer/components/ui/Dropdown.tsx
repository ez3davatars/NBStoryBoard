

interface DropdownProps {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    icon?: any;
}

export const Dropdown = ({
    label,
    value,
    options,
    onChange,
    icon: Icon
}: DropdownProps) => (
    <div className="flex-1 min-w-[120px]">
        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1 flex items-center gap-1">
            {Icon && <Icon className="w-3 h-3" />} {label}
        </label>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-[#18181b] border border-[#27272a] text-xs text-white p-1.5 rounded focus:border-yellow-500 outline-none appearance-none"
        >
            {options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
    </div>
);



