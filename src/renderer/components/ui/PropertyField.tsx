

interface PropertyFieldProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    icon?: any;
    type?: "text" | "textarea" | "number";
    placeholder?: string;
}

export const PropertyField = ({
    label,
    value,
    onChange,
    icon: Icon,
    type = "text",
    placeholder = ""
}: PropertyFieldProps) => (
    <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-gray-500 flex items-center gap-1">
            {Icon && <Icon className="w-3 h-3" />} {label}
        </label>
        {type === "textarea" ? (
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows={2}
                className="w-full bg-[#18181b] border border-[#27272a] text-xs text-white p-2 rounded focus:border-yellow-500 outline-none resize-none"
            />
        ) : (
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[#18181b] border border-[#27272a] text-xs text-white p-2 rounded focus:border-yellow-500 outline-none"
            />
        )}
    </div>
);



