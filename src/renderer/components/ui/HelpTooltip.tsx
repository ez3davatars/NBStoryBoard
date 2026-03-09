
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useHelp } from '../../context/HelpContext';
import { useAppContext } from '../../context/AppContext';

interface HelpTooltipProps {
 children: React.ReactNode;
 zone: string;
 id: string;
}

const HelpTooltip: React.FC<HelpTooltipProps> = ({ children, zone, id }) => {
 const help = useHelp(zone, id);
 const { state } = useAppContext();

 // Strict: Only render if type is correct and enabled
 if (!help || help.type !== 'tooltip' || !state.showHelpHints) {
 return <>{children}</>;
 }

 return (
 <TooltipPrimitive.Provider delayDuration={0}>
 <TooltipPrimitive.Root>
 <TooltipPrimitive.Trigger asChild>
 {children}
 </TooltipPrimitive.Trigger>
 <TooltipPrimitive.Portal>
 <TooltipPrimitive.Content
 className="z-[9999] max-w-[250px] whitespace-normal break-words text-center px-2 py-1.5 text-xs font-medium text-white bg-black rounded border border-gray-700"
 sideOffset={5}
 >
 {help.text}
 <TooltipPrimitive.Arrow className="fill-black" />
 </TooltipPrimitive.Content>
 </TooltipPrimitive.Portal>
 </TooltipPrimitive.Root>
 </TooltipPrimitive.Provider>
 );
};

export default HelpTooltip;



