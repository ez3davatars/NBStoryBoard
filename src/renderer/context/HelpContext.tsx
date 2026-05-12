/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from 'react';
import helpMapRaw from '../assets/help_map.json';

// Types derived directly from JSON structure
type HelpType = 'inline' | 'tooltip' | 'help';

interface HelpConfig {
 type: HelpType;
 text?: string;
 title?: string; // Only for 'help' type
}

interface HelpZone {
 [key: string]: HelpConfig;
}

interface HelpMap {
 version: string;
 zones: {
 [zoneName: string]: HelpZone;
 };
}

// 1. Load map verbatim
const helpMap = helpMapRaw as HelpMap;
const helpZoneAliases: Record<string, string> = {
 nano: 'nanoCast',
 nano_cast: 'nanoCast',
 staging: 'stage'
};
const emittedMissingHelpWarnings = new Set<string>();

const warnMissingHelpOnce = (key: string, message: string) => {
 if (process.env.NODE_ENV !== 'development' || emittedMissingHelpWarnings.has(key)) return;
 emittedMissingHelpWarnings.add(key);
 console.warn(message);
};

interface HelpContextType {
 useHelp: (zone: string, id: string) => HelpConfig | null;
}

const HelpContext = createContext<HelpContextType | null>(null);

export const HelpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {

 // 3. Pure Selector Hook
 const getHelp = (zone: string, id: string): HelpConfig | null => {
 // Strict lookup: Zone -> ID
 const resolvedZone = helpMap.zones[zone] ? zone : helpZoneAliases[zone] ?? zone;
 const zoneData = helpMap.zones[resolvedZone];
 if (!zoneData) {
 warnMissingHelpOnce(`zone:${zone}`, `[HelpContext] Zone not found: ${zone}`);
 return null;
 }

 const config = zoneData[id];
 if (!config) {
 warnMissingHelpOnce(`id:${resolvedZone}:${id}`, `[HelpContext] ID not found in zone ${resolvedZone}: ${id}`);
 return null;
 }

 return config;
 };

 const value = useMemo(() => ({ useHelp: getHelp }), []);

 return (
 <HelpContext.Provider value={value}>
 {children}
 </HelpContext.Provider>
 );
};

export const useHelp = (zone: string, id: string): HelpConfig | null => {
 const context = useContext(HelpContext);
 if (!context) {
 throw new Error('useHelp must be used within a HelpProvider');
 }
 return context.useHelp(zone, id);
};



