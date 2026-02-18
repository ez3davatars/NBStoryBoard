

import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';

export interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = 'warning'
}) => {
    const variantStyles = {
        danger: {
            icon: <AlertCircle className="w-6 h-6 text-red-500" />,
            button: "bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border-red-500/20",
            accent: "bg-red-500"
        },
        warning: {
            icon: <AlertCircle className="w-6 h-6 text-[#eab308]" />,
            button: "bg-[#eab308]/10 hover:bg-[#eab308] text-[#eab308] hover:text-black border-[#eab308]/20",
            accent: "bg-[#eab308]"
        },
        info: {
            icon: <AlertCircle className="w-6 h-6 text-blue-500" />,
            button: "bg-blue-500/10 hover:bg-blue-500 text-blue-500 hover:text-white border-blue-500/20",
            accent: "bg-blue-500"
        }
    };

    const style = variantStyles[variant];

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[4000] bg-black/80 backdrop-blur-md flex items-center justify-center p-8">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-[#111113] border border-white/10 rounded-3xl shadow-2xl max-w-sm w-full relative overflow-hidden"
                    >
                        {/* Top accent line */}
                        <div className={`h-1 w-full ${style.accent}`} />

                        <div className="p-8">
                            <div className="flex items-center gap-4 mb-4">
                                {style.icon}
                                <h3 className="text-xl font-black text-white uppercase tracking-wider">
                                    {title}
                                </h3>
                            </div>

                            <p className="text-gray-400 text-sm leading-relaxed mb-8">
                                {message}
                            </p>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-grow py-3 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                                >
                                    {cancelText}
                                </button>
                                <button
                                    onClick={() => {
                                        onConfirm();
                                        onClose();
                                    }}
                                    className={`flex-grow py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border transition-all shadow-lg ${style.button}`}
                                >
                                    {confirmText}
                                </button>
                            </div>
                        </div>

                        {/* Close icon for quick exit */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ConfirmDialog;



