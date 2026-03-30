import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, BookOpen } from 'lucide-react';

// Using Vite's raw import to safely bundle the guide text
import guideContentRaw from '../../../../USER_GUIDE.md?raw';

interface GuideViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const GuideViewerModal: React.FC<GuideViewerModalProps> = ({ isOpen, onClose }) => {
    const [content, setContent] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            setContent(guideContentRaw);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 sm:p-8 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#27272a] bg-[#09090b]">
                    <div className="flex items-center gap-3">
                        <BookOpen className="w-5 h-5 text-yellow-500" />
                        <h2 className="text-lg font-black text-white uppercase tracking-wider">Cast Director User Guide</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-transparent hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Body */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="prose prose-invert prose-yellow max-w-none">
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                                h1: ({node, ...props}) => <h1 className="text-3xl font-black text-white border-b border-white/10 pb-4 mb-6" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-2xl font-bold text-yellow-500 mt-10 mb-4" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-xl font-bold text-gray-200 mt-8 mb-3" {...props} />,
                                p: ({node, ...props}) => <p className="text-gray-300 leading-relaxed mb-4" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-2 mb-4 text-gray-300" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal list-inside space-y-2 mb-4 text-gray-300" {...props} />,
                                li: ({node, ...props}) => <li className="text-gray-300" {...props} />,
                                a: ({node, ...props}) => <a className="text-blue-400 hover:text-blue-300 underline" {...props} />,
                                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-yellow-500/50 bg-yellow-500/5 pl-4 py-2 my-4 text-gray-400 italic" {...props} />,
                                table: ({node, ...props}) => <div className="overflow-x-auto mb-6"><table className="w-full text-left border-collapse" {...props} /></div>,
                                th: ({node, ...props}) => <th className="border-b border-gray-700 py-3 px-4 font-bold text-white bg-white/5" {...props} />,
                                td: ({node, ...props}) => <td className="border-b border-gray-800 py-3 px-4 text-gray-300" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />,
                                hr: ({node, ...props}) => <hr className="border-gray-800 my-8" {...props} />
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>
        </div>
    );
};
