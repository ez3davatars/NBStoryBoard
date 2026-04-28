import React, { useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, BookOpen } from 'lucide-react';

// Using Vite's raw import to safely bundle the guide text
import guideContentRaw from '../../../../USER_GUIDE.md?raw';

interface GuideViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialAnchor?: string;
}

const getNodeText = (children: React.ReactNode): string => {
    return React.Children.toArray(children).map((child) => {
        if (typeof child === 'string' || typeof child === 'number') return String(child);
        if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
            return getNodeText(child.props.children);
        }
        return '';
    }).join('');
};

const slugifyHeading = (children: React.ReactNode): string => (
    getNodeText(children)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s/g, '-')
);

export const GuideViewerModal: React.FC<GuideViewerModalProps> = ({ isOpen, onClose, initialAnchor }) => {
    const content = guideContentRaw;
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const scrollToAnchor = useCallback((id: string, behavior: ScrollBehavior = 'smooth') => {
        const target = scrollContainerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
        target?.scrollIntoView({ behavior, block: 'start' });
    }, []);

    useEffect(() => {
        if (!isOpen || !initialAnchor) return;

        const frame = window.requestAnimationFrame(() => {
            scrollToAnchor(initialAnchor, 'auto');
        });

        return () => window.cancelAnimationFrame(frame);
    }, [initialAnchor, isOpen, scrollToAnchor]);

    const handleGuideLinkClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
        if (!href?.startsWith('#')) return;

        event.preventDefault();
        const id = decodeURIComponent(href.slice(1));
        scrollToAnchor(id);
    }, [scrollToAnchor]);

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
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="prose prose-invert prose-yellow max-w-none">
                        <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                                h1: ({node: _node, children, ...props}) => <h1 id={slugifyHeading(children)} className="scroll-mt-6 text-3xl font-black text-white border-b border-white/10 pb-4 mb-6" {...props}>{children}</h1>,
                                h2: ({node: _node, children, ...props}) => <h2 id={slugifyHeading(children)} className="scroll-mt-6 text-2xl font-bold text-yellow-500 mt-10 mb-4" {...props}>{children}</h2>,
                                h3: ({node: _node, children, ...props}) => <h3 id={slugifyHeading(children)} className="scroll-mt-6 text-xl font-bold text-gray-200 mt-8 mb-3" {...props}>{children}</h3>,
                                p: ({node: _node, ...props}) => <p className="text-gray-300 leading-relaxed mb-4" {...props} />,
                                ul: ({node: _node, ...props}) => <ul className="list-disc list-inside space-y-2 mb-4 text-gray-300" {...props} />,
                                ol: ({node: _node, ...props}) => <ol className="list-decimal list-inside space-y-2 mb-4 text-gray-300" {...props} />,
                                li: ({node: _node, ...props}) => <li className="text-gray-300" {...props} />,
                                a: ({node: _node, href, ...props}) => <a className="text-blue-400 hover:text-blue-300 underline cursor-pointer" href={href} onClick={(event) => handleGuideLinkClick(event, href)} {...props} />,
                                blockquote: ({node: _node, ...props}) => <blockquote className="border-l-4 border-yellow-500/50 bg-yellow-500/5 pl-4 py-2 my-4 text-gray-400 italic" {...props} />,
                                table: ({node: _node, ...props}) => <div className="overflow-x-auto mb-6"><table className="w-full text-left border-collapse" {...props} /></div>,
                                th: ({node: _node, ...props}) => <th className="border-b border-gray-700 py-3 px-4 font-bold text-white bg-white/5" {...props} />,
                                td: ({node: _node, ...props}) => <td className="border-b border-gray-800 py-3 px-4 text-gray-300" {...props} />,
                                strong: ({node: _node, ...props}) => <strong className="font-bold text-white" {...props} />,
                                hr: ({node: _node, ...props}) => <hr className="border-gray-800 my-8" {...props} />
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
