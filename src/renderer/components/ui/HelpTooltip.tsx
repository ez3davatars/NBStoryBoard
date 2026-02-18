
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useHelp } from '../../context/HelpContext';

interface HelpTooltipProps {
    children: React.ReactNode;
    zone: string;
    id: string;
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({ children, zone, id }) => {
    const help = useHelp(zone, id);

    // Strict: Only render if type is correct
    if (!help || help.type !== 'tooltip') {
        return <>{children}</>;
    }

    return (
        <TooltipPrimitive.Provider delayDuration={0}>
            <TooltipPrimitive.Root>
                <TooltipPrimitive.Trigger asChild>
                    {children}
                </TooltipPrimitive.Trigger>
                <TooltipPrimitive.Content
                    className="z-50 px-2 py-1 text-xs font-medium text-white bg-black rounded shadow-lg border border-gray-700"
                    sideOffset={5}
                >
                    {help.text}
                    <TooltipPrimitive.Arrow className="fill-black" />
                </TooltipPrimitive.Content>
            </TooltipPrimitive.Root>
        </TooltipPrimitive.Provider>
    );
};

export default HelpTooltip;



