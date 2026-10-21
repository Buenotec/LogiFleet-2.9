import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Truck, MapPin, Info, AlertTriangle, CheckCircle2, Clock, Filter, Layers, Maximize, Plus, Minus, ChevronLeft, ChevronRight, Play, Compass, Activity, Shield, Cpu, Wifi, RotateCcw } from "lucide-react";
import type { Vehicle } from "../types";
import { cn } from "@/src/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { NeonClusterTooltip } from "./NeonClusterTooltip";

// Fix for default marker icons in Leaflet with React
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapTabProps {
  vehicles: Vehicle[];
  selectedOperation: string[];
  selectedStatus: string[];
  selectedCity: string[];
  selectedDriver: string[];
  originCity: string;
  destinationCity: string;
  setRouteDistance: (distance: number | null) => void;
  onSelectOperation?: (operation: string) => void;
  onResetFilters?: () => void;
}

// Pre-defined coordinates for common Brazilian cities/bases to ensure immediate functionality
const CITY_COORDINATES: Record<string, [number, number]> = {
  "UBERLANDIA": [-18.9186, -48.2772],
  "UBERLÂNDIA": [-18.9186, -48.2772],
  "SAO PAULO": [-23.5505, -46.6333],
  "SÃO PAULO": [-23.5505, -46.6333],
  "CUIABA": [-15.6014, -56.0979],
  "CUIABÁ": [-15.6014, -56.0979],
  "GOIANIA": [-16.6869, -49.2648],
  "GOIÂNIA": [-16.6869, -49.2648],
  "MATO GROSSO": [-12.6819, -56.9211],
  "GOIAS": [-15.827, -49.8362],
  "GOIÁS": [-15.827, -49.8362],
  "RONDONOPOLIS": [-16.4677, -54.6361],
  "RONDONÓPOLIS": [-16.4677, -54.6361],
  "SORRISO": [-12.5444, -55.7231],
  "SINOP": [-11.8608, -55.5095],
  "LUCAS DO RIO VERDE": [-13.0644, -55.9103],
  "NOVA MUTUM": [-13.8303, -56.0822],
  "RIO VERDE": [-17.7912, -50.9208],
  "JATAI": [-17.8814, -51.7144],
  "JATAÍ": [-17.8814, -51.7144],
  "BRASILIA": [-15.7801, -47.9292],
  "BRASÍLIA": [-15.7801, -47.9292],
  "BELO HORIZONTE": [-19.9167, -43.9345],
  "RIO DE JANEIRO": [-22.9068, -43.1729],
  "CURITIBA": [-25.4284, -49.2733],
  "PORTO ALEGRE": [-30.0346, -51.2177],
  "SALVADOR": [-12.9714, -38.5014],
  "RECIFE": [-8.0543, -34.8813],
  "FORTALEZA": [-3.7172, -38.5433],
  "MANAUS": [-3.119, -60.0217],
  "BELEM": [-1.4558, -48.4902],
  "BELÉM": [-1.4558, -48.4902],
  "CAMPO GRANDE": [-20.4428, -54.6464],
  "PALMAS": [-10.1675, -48.3277],
  "TERESINA": [-5.092, -42.8038],
  "SAO LUIS": [-2.5307, -44.3068],
  "SÃO LUÍS": [-2.5307, -44.3068],
  "MACEIO": [-9.6658, -35.7353],
  "MACEIÓ": [-9.6658, -35.7353],
  "ARACAJU": [-10.9472, -37.0731],
  "JOAO PESSOA": [-7.115, -34.8631],
  "JOÃO PESSOA": [-7.115, -34.8631],
  "NATAL": [-5.7945, -35.211],
  "FLORIANOPOLIS": [-27.5948, -48.5482],
  "FLORIANÓPOLIS": [-27.5948, -48.5482],
  "VITORIA": [-20.3155, -40.3128],
  "VITÓRIA": [-20.3155, -40.3128],
  "PORTO VELHO": [-8.7612, -63.9039],
  "RIO BRANCO": [-9.9747, -67.8076],
  "BOA VISTA": [2.8235, -60.6758],
  "MACAPA": [0.034, -51.066],
  "MACAPÁ": [0.034, -51.066],
  // Base Garagem Central
  "RIBEIRAO PRETO": [-21.1775, -47.8103],
  "RIBEIRÃO PRETO": [-21.1775, -47.8103],
  "GARAGEM RIBEIRAO PRETO": [-21.1775, -47.8103],
  "GARAGEM RIBEIRÃO PRETO": [-21.1775, -47.8103],
  "BASE RIBEIRAO PRETO": [-21.1775, -47.8103],
  "BASE RIBEIRÃO PRETO": [-21.1775, -47.8103],
  "GARAGEM": [-21.1775, -47.8103],
  "RP": [-21.1775, -47.8103],
  // Cidades dinâmicas das planilhas de frotas
  "CAMPO NOVO DO PARECIS": [-13.6756, -57.8878],
  "PRIMAVERA DO LESTE": [-15.5586, -54.2983],
  "PRIMAVER DO LESTE": [-15.5586, -54.2983],
  "CAMPO VERDE": [-15.5458, -55.1667],
  "MONTIVIDIU": [-17.4444, -51.1764],
  "MONTIVIDU": [-17.4444, -51.1764],
  "ITAPETININGA": [-23.5917, -48.0531],
  "RIBEIRÃO GRANDE": [-24.0094, -48.3653],
  "RIBEIRAO GRANDE": [-24.0094, -48.3653],
  "CAPELA DO ALTO": [-23.4703, -47.7339],
  "CAPÃO BONITO": [-24.0064, -48.3492],
  "CAPAO BONITO": [-24.0064, -48.3492],
  "RECHAN": [-23.6333, -48.2833],
};

const OPERATION_COLORS: Record<string, string> = {
  // Cores alinhadas com as abas das 4 planilhas
  "BAYER MT": "#10b981", // Verde da aba BAYER. M.T
  "BAYER. M.T": "#10b981",
  "BAYER - M.T": "#10b981",
  "BAYER GO": "#00a8e8", // Azul Ciano da aba BAYER - G.O
  "BAYER - G.O": "#00a8e8",
  "BAYER. G.O": "#00a8e8",
  "CITROSUCO - UBERLANDIA": "#7b2cbf", // Roxo da aba CITROSUCO - UBERLANDIA
  "CITROSUCO - UBERLÂNDIA": "#7b2cbf",
  "CITROSUCO - SÃO PAULO": "#f59e0b", // Amarelo/Âmbar da aba CITROSUCO - SÃO PAULO
  "CITROSUCO - SAO PAULO": "#f59e0b",
  "AMBEV": "#ffcc00",
  "BRF": "#ffde00",
  "JBS": "#004a99",
  "RAIZEN": "#6e2d91",
  "RAÍZEN": "#6e2d91",
  "VALE": "#007a33",
  "default": "#3b82f6"
};

// Localizações padrão para as 4 operações (BAYER. M.T, BAYER - G.O, CITROSUCO - UBERLANDIA, CITROSUCO - SÃO PAULO)
// quando o veículo não tiver cidade preenchida na planilha
export const DEFAULT_OPERATION_LOCATIONS: Record<string, { city: string; coords: [number, number]; uf: string; label: string }> = {
  "BAYER MT": { city: "Lucas do Rio Verde", coords: [-13.0644, -55.9103], uf: "MT", label: "Lucas do Rio Verde (Padrão BAYER. M.T)" },
  "BAYER. M.T": { city: "Lucas do Rio Verde", coords: [-13.0644, -55.9103], uf: "MT", label: "Lucas do Rio Verde (Padrão BAYER. M.T)" },
  "BAYER - M.T": { city: "Lucas do Rio Verde", coords: [-13.0644, -55.9103], uf: "MT", label: "Lucas do Rio Verde (Padrão BAYER. M.T)" },
  "BAYER GO": { city: "Rio Verde", coords: [-17.7912, -50.9208], uf: "GO", label: "Rio Verde (Padrão BAYER - G.O)" },
  "BAYER - G.O": { city: "Rio Verde", coords: [-17.7912, -50.9208], uf: "GO", label: "Rio Verde (Padrão BAYER - G.O)" },
  "CITROSUCO - UBERLANDIA": { city: "Uberlândia", coords: [-18.9186, -48.2772], uf: "MG", label: "Uberlândia (Padrão CITROSUCO - UBERLANDIA)" },
  "CITROSUCO - UBERLÂNDIA": { city: "Uberlândia", coords: [-18.9186, -48.2772], uf: "MG", label: "Uberlândia (Padrão CITROSUCO - UBERLANDIA)" },
  "CITROSUCO - SÃO PAULO": { city: "São Paulo", coords: [-23.5505, -46.6333], uf: "SP", label: "São Paulo (Padrão CITROSUCO - SÃO PAULO)" },
  "CITROSUCO - SAO PAULO": { city: "São Paulo", coords: [-23.5505, -46.6333], uf: "SP", label: "São Paulo (Padrão CITROSUCO - SÃO PAULO)" },
};

export function getDefaultLocation(operationName: string) {
  const norm = (operationName || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (norm.includes("BAYER") && norm.includes("MT")) {
    return { city: "Lucas do Rio Verde", coords: [-13.0644, -55.9103] as [number, number], uf: "MT", label: "Lucas do Rio Verde / MT (Padrão BAYER. M.T)" };
  }
  if (norm.includes("BAYER") && norm.includes("GO")) {
    return { city: "Rio Verde", coords: [-17.7912, -50.9208] as [number, number], uf: "GO", label: "Rio Verde / GO (Padrão BAYER - G.O)" };
  }
  if (norm.includes("CITROSUCO") && norm.includes("UBERLANDIA")) {
    return { city: "Uberlândia", coords: [-18.9186, -48.2772] as [number, number], uf: "MG", label: "Uberlândia / MG (Padrão CITROSUCO - UBERLANDIA)" };
  }
  if (norm.includes("CITROSUCO") && (norm.includes("SAO PAULO") || norm.includes("SP"))) {
    return { city: "São Paulo", coords: [-23.5505, -46.6333] as [number, number], uf: "SP", label: "São Paulo / SP (Padrão CITROSUCO - SÃO PAULO)" };
  }
  return null;
}

// Helper to create custom colored markers
const createColoredIcon = (color: string) => {
  return L.divIcon({
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`,
    className: "custom-marker-icon",
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });
};

export default function MapTab({ 
  vehicles, 
  selectedOperation, 
  selectedStatus, 
  selectedCity, 
  selectedDriver,
  originCity,
  destinationCity,
  setRouteDistance,
  onSelectOperation,
  onResetFilters
}: MapTabProps) {
  const [geocodedVehicles, setGeocodedVehicles] = useState<Vehicle[]>([]);
  const [mapStarted, setMapStarted] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const [simulatedPositions, setSimulatedPositions] = useState<Record<string, [number, number]>>({});
  const [simulationActive, setSimulationActive] = useState(false);
  const [mapType, setMapType] = useState<'dark' | 'cyber' | 'satellite' | 'streets' | 'esri-dark' | 'light' | 'topo'>('dark');
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [showVehicleList, setShowVehicleList] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);

  // 3D Animated Neon Cluster Tooltip State
  const [activeClusterTooltip, setActiveClusterTooltip] = useState<{
    cluster: any;
    latLng: L.LatLng;
    vehicles: Vehicle[];
    count: number;
    isPinned: boolean;
  } | null>(null);
  const [tooltipScreenPos, setTooltipScreenPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mapContainerDimensions, setMapContainerDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Configuração de Camadas de Mapa 100% Livres de API Key e Sem Marcas d'Água
  const MAP_LAYER_OPTIONS: { id: 'dark' | 'cyber' | 'satellite' | 'streets' | 'esri-dark' | 'light' | 'topo'; label: string; desc: string }[] = [
    { id: 'dark', label: 'Modo Escuro', desc: 'Mapa Noturno HD de alto contraste (100% livre de API Key)' },
    { id: 'cyber', label: 'Cyber HUD', desc: 'Modo Tático Noturno Neon com traçados luminosos' },
    { id: 'satellite', label: 'Satélite HD', desc: 'Foto aérea Esri HD com malha viária e cidades' },
    { id: 'streets', label: 'Logística & Vias', desc: 'Malha rodoviária completa com números de estradas e cidades' },
    { id: 'esri-dark', label: 'Esri Dark', desc: 'Canvas Dark Gray suave da Esri' },
    { id: 'light', label: 'Claro OSM', desc: 'OpenStreetMap Padrão' },
    { id: 'topo', label: 'Relevo', desc: 'Topográfico com relevo e curvas' }
  ];

  // Base list of operations present in LICENCAS
  const allOperations = useMemo(() => {
    const ops = new Set<string>();
    vehicles.forEach(v => {
      if (v.source === "LICENCAS" && v.operation) {
        ops.add(v.operation);
      }
    });
    return Array.from(ops).sort();
  }, [vehicles]);

  // Resolução de cidade e motorista para Mapas:
  // Nas 4 abas (BAYER. M.T, BAYER - G.O, CITROSUCO - UBERLANDIA, CITROSUCO - SÃO PAULO):
  // Se houver cidade e motorista disponíveis e preenchidos na linha, utilizar como preferência;
  // Caso não tiver cidade preenchida, utilizar a localização padrão da respectiva operação.
  const resolvedVehicles = useMemo(() => {
    return vehicles
      .filter(v => v.source === "LICENCAS")
      .map(v => {
        const rawCity = (v.cityBase || "").trim();
        const hasCity = rawCity.length > 0 && rawCity !== "-" && rawCity.toUpperCase() !== "N/A";
        const defaultLoc = getDefaultLocation(v.operation);

        let effectiveCity = rawCity;
        let isDefaultLocation = false;
        let coords: [number, number] | null = null;

        if (hasCity) {
          // Preferência: dados preenchidos na planilha
          effectiveCity = rawCity;
          isDefaultLocation = false;
          const upperCity = rawCity.toUpperCase().trim();
          if (CITY_COORDINATES[upperCity]) {
            coords = CITY_COORDINATES[upperCity];
          } else if (upperCity.includes("RIBEIR") && !upperCity.includes("GRANDE")) {
            coords = CITY_COORDINATES["RIBEIRÃO PRETO"];
          }
        } else if (defaultLoc) {
          // Fallback: Localização padrão da respectiva operação
          effectiveCity = defaultLoc.city;
          isDefaultLocation = true;
          coords = defaultLoc.coords;
        }

        const rawDriver = (v.driver || "").trim();
        const hasDriver = rawDriver.length > 0 && rawDriver !== "-" && rawDriver.toUpperCase() !== "N/A";
        const isDefenir = rawDriver.toUpperCase() === "DEFENIR" || rawDriver.toUpperCase() === "DEFINIR";

        let effectiveDriver = rawDriver;
        if (!hasDriver) {
          effectiveDriver = "Não informado";
        } else if (isDefenir) {
          effectiveDriver = "A definir";
        }

        return {
          ...v,
          rawCity,
          cityBase: effectiveCity,
          isDefaultLocation,
          isPreferredLocation: hasCity,
          defaultLocationName: defaultLoc?.label,
          rawDriver,
          driver: effectiveDriver,
          resolvedCoords: coords
        };
      });
  }, [vehicles]);

  // Filter vehicles by all criteria and source
  const filteredVehicles = useMemo(() => {
    return resolvedVehicles.filter(v => {
      const matchOp = selectedOperation.length === 0 || selectedOperation.includes(v.operation);
      const matchStatus = selectedStatus.length === 0 || selectedStatus.includes(v.overallStatus);
      const matchCity = selectedCity.length === 0 || selectedCity.some(sc => {
        const scNorm = sc.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const vCityNorm = (v.cityBase || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (scNorm === vCityNorm) return true;
        if (scNorm.includes("UBERLANDIA") && vCityNorm.includes("UBERLANDIA")) return true;
        if (scNorm.includes("SAO PAULO") && vCityNorm.includes("SAO PAULO")) return true;
        if (scNorm.includes("LUCAS") && vCityNorm.includes("LUCAS")) return true;
        if (scNorm.includes("RIO VERDE") && vCityNorm.includes("RIO VERDE")) return true;
        if (scNorm.includes("RIBEIR") && vCityNorm.includes("RIBEIR") && !vCityNorm.includes("GRANDE") && !scNorm.includes("GRANDE")) return true;
        return false;
      });
      const matchDriver = selectedDriver.length === 0 || selectedDriver.some(sd => {
        const sdNorm = sd.toUpperCase().trim();
        const vDriverNorm = (v.driver || "").toUpperCase().trim();
        const vRawDriverNorm = (v.rawDriver || "").toUpperCase().trim();
        return sdNorm === vDriverNorm || sdNorm === vRawDriverNorm;
      });
      return matchOp && matchStatus && matchCity && matchDriver;
    });
  }, [resolvedVehicles, selectedOperation, selectedStatus, selectedCity, selectedDriver]);

  // Route simulation logic
  useEffect(() => {
    const calculateRoute = async () => {
      if (!originCity || !destinationCity) {
        setRoutePath([]);
        setRouteDistance(null);
        return;
      }

      const originCoords = CITY_COORDINATES[originCity.toUpperCase().trim()];
      const destCoords = CITY_COORDINATES[destinationCity.toUpperCase().trim()];

      if (originCoords && destCoords) {
        setRoutePath([originCoords, destCoords]);
        
        // Simple Haversine distance calculation
        const R = 6371; // Earth's radius in km
        const dLat = (destCoords[0] - originCoords[0]) * Math.PI / 180;
        const dLon = (destCoords[1] - originCoords[1]) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(originCoords[0] * Math.PI / 180) * Math.cos(destCoords[0] * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        setRouteDistance(Math.round(distance));
      } else {
        setRoutePath([]);
        setRouteDistance(null);
      }
    };

    calculateRoute();
  }, [originCity, destinationCity, setRouteDistance]);

  useEffect(() => {
    const geocode = async () => {
      setIsGeocoding(true);
      const updated = await Promise.all(filteredVehicles.map(async (v) => {
        // Se já possui resolvedCoords (cidade preferencial da planilha ou localização padrão da operação)
        if (v.resolvedCoords) {
          const [lat, lng] = v.resolvedCoords;
          // Dispersão sutil determinística para veículos agrupados na mesma cidade não ficarem exatamente sobrepostos
          const seed = ((v.plate || "") + (v.fleet || "")).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const angle = (seed % 360) * (Math.PI / 180);
          const radius = 0.0025 + ((seed % 10) * 0.0008); // raio de 250m a 800m
          const latOffset = Math.sin(angle) * radius;
          const lngOffset = Math.cos(angle) * radius;
          return { ...v, lat: lat + latOffset, lng: lng + lngOffset };
        }

        // If already has lat/lng from server, use it
        if (v.lat && v.lng && v.lat !== 0 && v.lng !== 0) return v;

        // Try local cache
        const cityKey = v.cityBase?.toUpperCase().trim() || "";
        if (CITY_COORDINATES[cityKey]) {
          const [lat, lng] = CITY_COORDINATES[cityKey];
          const offset = (Math.random() - 0.5) * 0.01;
          return { ...v, lat: lat + offset, lng: lng + offset };
        }

        // Check if cityKey mentions Ribeirão Preto or Garagem
        if (cityKey.includes("RIBEIR") && !cityKey.includes("GRANDE")) {
          const [lat, lng] = CITY_COORDINATES["RIBEIRÃO PRETO"];
          const offset = (Math.random() - 0.5) * 0.01;
          return { ...v, lat: lat + offset, lng: lng + offset };
        }

        // Operation fallbacks for realistic geocoding
        const defaultLoc = getDefaultLocation(v.operation);
        if (defaultLoc) {
          const [lat, lng] = defaultLoc.coords;
          const offset = (Math.random() - 0.5) * 0.02;
          return { ...v, lat: lat + offset, lng: lng + offset };
        }

        // Fallback: Default to center of Brazil if no city info
        return { ...v, lat: -14.235, lng: -51.9253 };
      }));
      setGeocodedVehicles(updated);
      setIsGeocoding(false);
    };

    geocode();
  }, [filteredVehicles]);

  // City Simulation Effect
  useEffect(() => {
    if (selectedCity.length > 0) {
      setSimulationActive(true);
      const interval = setInterval(() => {
        setSimulatedPositions(prev => {
          const next: Record<string, [number, number]> = { ...prev };
          geocodedVehicles.forEach(v => {
            if (selectedCity.includes(v.cityBase)) {
              const current = prev[v.id] || [v.lat!, v.lng!];
              // Move slightly (approx 10-20 meters)
              const latOffset = (Math.random() - 0.5) * 0.0002;
              const lngOffset = (Math.random() - 0.5) * 0.0002;
              next[v.id] = [current[0] + latOffset, current[1] + lngOffset];
            }
          });
          return next;
        });
      }, 2000);
      return () => clearInterval(interval);
    } else {
      setSimulationActive(false);
      setSimulatedPositions({});
    }
  }, [selectedCity, geocodedVehicles]);

  useEffect(() => {
    setSelectedVehicleId(null);
  }, [selectedOperation, selectedCity]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    geocodedVehicles.forEach(v => {
      counts[v.operation] = (counts[v.operation] || 0) + 1;
    });
    return {
      total: geocodedVehicles.length,
      byOperation: counts
    };
  }, [geocodedVehicles]);

  // Ensure operations exist even when filtered or loaded
  const displayOperations = useMemo(() => {
    // When an operation is selected, show its count from stats, plus other operations with their count
    const opsMap = new Map<string, number>();
    allOperations.forEach(op => {
      opsMap.set(op, stats.byOperation[op] || 0);
    });
    // Add any operation in stats that might not be in allOperations
    Object.entries(stats.byOperation).forEach(([op, count]) => {
      opsMap.set(op, Number(count));
    });
    return Array.from(opsMap.entries());
  }, [allOperations, stats.byOperation]);

  // Lookup map for fast retrieval of vehicle by ID
  const vehicleMap = useMemo(() => {
    const vMap = new Map<string, Vehicle>();
    geocodedVehicles.forEach(v => vMap.set(v.id, v));
    return vMap;
  }, [geocodedVehicles]);

  // Helper to extract vehicles belonging to a cluster
  const getVehiclesFromCluster = useCallback((cluster: any): Vehicle[] => {
    if (!cluster || typeof cluster.getAllChildMarkers !== "function") return [];
    const markers = cluster.getAllChildMarkers();
    const list: Vehicle[] = [];
    const seenIds = new Set<string>();

    for (const m of markers) {
      const v: Vehicle | undefined = m.vehicleData || m.options?.vehicleData || (m.options?.vehicleId && vehicleMap.get(m.options.vehicleId));
      if (v && !seenIds.has(v.id)) {
        seenIds.add(v.id);
        list.push(v);
      }
    }
    return list;
  }, [vehicleMap]);

  // Monitor map container dimensions for bounds clamping
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const updateSize = () => {
      if (mapContainerRef.current) {
        setMapContainerDimensions({
          width: mapContainerRef.current.clientWidth,
          height: mapContainerRef.current.clientHeight
        });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(mapContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // Calculate exact viewport screen coordinates for the tooltip
  const getScreenCoordinates = useCallback((latLng: L.LatLng) => {
    if (!map) return { x: 0, y: 0 };
    try {
      const container = map.getContainer();
      const rect = container.getBoundingClientRect();
      const p = map.latLngToContainerPoint(latLng);
      return {
        x: rect.left + p.x,
        y: rect.top + p.y
      };
    } catch {
      return { x: 0, y: 0 };
    }
  }, [map]);

  // Synchronize 3D Neon Tooltip screen coordinates on map move / zoom
  useEffect(() => {
    if (!map || !activeClusterTooltip) return;
    const updatePos = () => {
      const pos = getScreenCoordinates(activeClusterTooltip.latLng);
      if (pos.x > 0 || pos.y > 0) {
        setTooltipScreenPos(pos);
      }
    };
    updatePos();
    map.on("move", updatePos);
    map.on("zoom", updatePos);
    return () => {
      map.off("move", updatePos);
      map.off("zoom", updatePos);
    };
  }, [map, activeClusterTooltip?.latLng, getScreenCoordinates]);

  // Cluster interaction handlers
  const handleClusterMouseOver = useCallback((e: any) => {
    if (activeClusterTooltip?.isPinned) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);

    const cluster = e.layer;
    if (!cluster) return;

    const vehiclesInCluster = getVehiclesFromCluster(cluster);
    if (vehiclesInCluster.length === 0) return;

    const latLng = cluster.getLatLng();
    setTooltipScreenPos(getScreenCoordinates(latLng));

    setActiveClusterTooltip({
      cluster,
      latLng,
      vehicles: vehiclesInCluster,
      count: cluster.getChildCount() || vehiclesInCluster.length,
      isPinned: false
    });
  }, [activeClusterTooltip?.isPinned, getVehiclesFromCluster, getScreenCoordinates]);

  const handleClusterMouseOut = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setActiveClusterTooltip(prev => (prev?.isPinned ? prev : null));
    }, 350);
  }, []);

  const handleClusterClick = useCallback((e: any) => {
    // Fecha o tooltip para que a explosão aconteça de forma limpa e visível no mapa
    setActiveClusterTooltip(null);

    const cluster = e.layer;
    if (!cluster) return;

    // Executa a explosão imediata: zoomToBounds desmembra o agrupamento em sub-grupos ou veículos
    if (typeof cluster.zoomToBounds === "function") {
      cluster.zoomToBounds({ padding: [40, 40] });
    } else if (typeof cluster.spiderfy === "function") {
      cluster.spiderfy();
    }
  }, []);

  const handleTooltipMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  }, []);

  const handleTooltipMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setActiveClusterTooltip(prev => (prev?.isPinned ? prev : null));
    }, 250);
  }, []);

  const handleExpandCluster = useCallback(() => {
    if (!map || !activeClusterTooltip?.cluster) return;
    const cluster = activeClusterTooltip.cluster;
    setActiveClusterTooltip(null);

    if (typeof cluster.zoomToBounds === "function") {
      cluster.zoomToBounds({ padding: [40, 40] });
    } else if (typeof cluster.getBounds === "function") {
      const bounds = cluster.getBounds();
      if (bounds && bounds.isValid && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17, animate: true });
      }
    } else {
      map.setView(activeClusterTooltip.latLng, (map.getZoom() || 10) + 2, { animate: true });
    }
  }, [map, activeClusterTooltip]);

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      <AnimatePresence mode="wait">
        {!mapStarted && (
          <motion.div
            key="intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-[2000] bg-[#070b13] flex flex-col items-center justify-center overflow-hidden"
          >
            {/* Ambient Background Grid */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,23,42,0)_40%,rgba(7,11,19,0.9)_100%)] z-10 pointer-events-none" />
            
            {/* SVG Interactive Neon Map */}
            <svg 
              className="absolute inset-0 w-full h-full opacity-65 pointer-events-none" 
              viewBox="0 0 1000 600" 
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                {/* Glow Filters */}
                <filter id="neon-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-pink" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="neon-glow-green" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                
                {/* Headlight Gradients */}
                <linearGradient id="headlight-cyan" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="headlight-pink" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ff007f" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#ff007f" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="headlight-yellow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#eab308" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
                </linearGradient>

                {/* Cyber Grid Pattern */}
                <pattern id="cyber-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.75" opacity="0.35" />
                </pattern>

                <style>{`
                  @keyframes scan {
                    0% { transform: translateY(-50%); }
                    100% { transform: translateY(50%); }
                  }
                  .animate-scan {
                    animation: scan 12s linear infinite;
                  }
                `}</style>
              </defs>

              {/* Grid Background */}
              <rect width="100%" height="100%" fill="url(#cyber-grid)" />

              {/* Secondary static street network in dark gray */}
              <g stroke="#334155" strokeWidth="1" opacity="0.18" fill="none">
                <path d="M 0,100 L 1000,100" />
                <path d="M 0,300 L 1000,300" />
                <path d="M 0,500 L 1000,500" />
                <path d="M 150,0 L 150,600" />
                <path d="M 450,0 L 450,600" />
                <path d="M 750,0 L 750,600" />
                <path d="M 100,100 Q 250,250 400,100 T 700,100" />
                <path d="M 200,500 Q 400,300 600,500 T 1000,500" />
              </g>

              {/* Road 1: Cyan Route */}
              <path 
                id="cyan-road" 
                d="M -50,150 Q 250,150 350,250 T 750,250 Q 850,250 1050,350" 
                fill="none" 
                stroke="#00f0ff" 
                strokeWidth="6" 
                opacity="0.1" 
                filter="url(#neon-glow-cyan)" 
              />
              <path 
                d="M -50,150 Q 250,150 350,250 T 750,250 Q 850,250 1050,350" 
                fill="none" 
                stroke="#00f0ff" 
                strokeWidth="2.5" 
                opacity="0.4" 
                filter="url(#neon-glow-cyan)" 
              />
              <path 
                d="M -50,150 Q 250,150 350,250 T 750,250 Q 850,250 1050,350" 
                fill="none" 
                stroke="#ffffff" 
                strokeWidth="1" 
                opacity="0.9" 
              />

              {/* Road 2: Pink Route */}
              <path 
                id="pink-road" 
                d="M 150,650 Q 150,450 300,350 T 700,250 Q 850,150 850,-50" 
                fill="none" 
                stroke="#ff007f" 
                strokeWidth="6" 
                opacity="0.1" 
                filter="url(#neon-glow-pink)" 
              />
              <path 
                d="M 150,650 Q 150,450 300,350 T 700,250 Q 850,150 850,-50" 
                fill="none" 
                stroke="#ff007f" 
                strokeWidth="2.5" 
                opacity="0.4" 
                filter="url(#neon-glow-pink)" 
              />
              <path 
                d="M 150,650 Q 150,450 300,350 T 700,250 Q 850,150 850,-50" 
                fill="none" 
                stroke="#ffffff" 
                strokeWidth="1" 
                opacity="0.9" 
              />

              {/* Road 3: Green Route */}
              <path 
                id="green-road" 
                d="M -50,450 H 300 L 450,300 H 700 L 850,150 H 1050" 
                fill="none" 
                stroke="#39ff14" 
                strokeWidth="6" 
                opacity="0.1" 
                filter="url(#neon-glow-green)" 
              />
              <path 
                d="M -50,450 H 300 L 450,300 H 700 L 850,150 H 1050" 
                fill="none" 
                stroke="#39ff14" 
                strokeWidth="2.5" 
                opacity="0.4" 
                filter="url(#neon-glow-green)" 
              />
              <path 
                d="M -50,450 H 300 L 450,300 H 700 L 850,150 H 1050" 
                fill="none" 
                stroke="#ffffff" 
                strokeWidth="1" 
                opacity="0.9" 
              />

              {/* Interactive Nodes */}
              <g className="opacity-80">
                <circle cx="350" cy="250" r="5" fill="#00f0ff" />
                <circle cx="350" cy="250" r="14" stroke="#00f0ff" strokeWidth="1" fill="none" opacity="0.4" className="animate-ping" style={{ animationDuration: '3s' }} />
                
                <circle cx="700" cy="250" r="5" fill="#ff007f" />
                <circle cx="700" cy="250" r="14" stroke="#ff007f" strokeWidth="1" fill="none" opacity="0.4" className="animate-ping" style={{ animationDuration: '4.5s' }} />

                <circle cx="450" cy="300" r="5" fill="#39ff14" />
                <circle cx="450" cy="300" r="14" stroke="#39ff14" strokeWidth="1" fill="none" opacity="0.4" className="animate-ping" style={{ animationDuration: '3.8s' }} />
              </g>

              {/* VEHICLE 1 (Yellow Car on Cyan Road) */}
              <g>
                <animateMotion dur="14s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#cyan-road" />
                </animateMotion>
                <polygon points="12,0 48,-16 48,16" fill="url(#headlight-yellow)" opacity="0.25" />
                <ellipse cx="0" cy="0" rx="16" ry="9" fill="#eab308" filter="url(#neon-glow-cyan)" opacity="0.3" />
                <rect x="-13" y="-7" width="26" height="14" rx="4" fill="#eab308" stroke="#ffffff" strokeWidth="1.2" />
                <rect x="0" y="-5" width="8" height="10" rx="2" fill="#070b13" />
                <circle cx="12" cy="-4" r="1.5" fill="#ffffff" />
                <circle cx="12" cy="4" r="1.5" fill="#ffffff" />
                <rect x="-13" y="-5" width="1.5" height="2" fill="#ef4444" />
                <rect x="-13" y="3" width="1.5" height="2" fill="#ef4444" />
              </g>

              {/* VEHICLE 2 (Hot Pink Car on Pink Road) */}
              <g>
                <animateMotion dur="11s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#pink-road" />
                </animateMotion>
                <polygon points="12,0 48,-16 48,16" fill="url(#headlight-pink)" opacity="0.25" />
                <ellipse cx="0" cy="0" rx="16" ry="9" fill="#ff007f" filter="url(#neon-glow-pink)" opacity="0.3" />
                <rect x="-13" y="-7" width="26" height="14" rx="4" fill="#ff007f" stroke="#ffffff" strokeWidth="1.2" />
                <rect x="0" y="-5" width="8" height="10" rx="2" fill="#070b13" />
                <circle cx="12" cy="-4" r="1.5" fill="#ffffff" />
                <circle cx="12" cy="4" r="1.5" fill="#ffffff" />
                <rect x="-13" y="-5" width="1.5" height="2" fill="#ef4444" />
                <rect x="-13" y="3" width="1.5" height="2" fill="#ef4444" />
              </g>

              {/* VEHICLE 3 (Lime/Green/Cyan Car on Green Road) */}
              <g>
                <animateMotion dur="16s" repeatCount="indefinite" rotate="auto">
                  <mpath href="#green-road" />
                </animateMotion>
                <polygon points="12,0 48,-16 48,16" fill="url(#headlight-cyan)" opacity="0.25" />
                <ellipse cx="0" cy="0" rx="16" ry="9" fill="#00f0ff" filter="url(#neon-glow-green)" opacity="0.3" />
                <rect x="-13" y="-7" width="26" height="14" rx="4" fill="#00f0ff" stroke="#ffffff" strokeWidth="1.2" />
                <rect x="0" y="-5" width="8" height="10" rx="2" fill="#070b13" />
                <circle cx="12" cy="-4" r="1.5" fill="#ffffff" />
                <circle cx="12" cy="4" r="1.5" fill="#ffffff" />
                <rect x="-13" y="-5" width="1.5" height="2" fill="#ef4444" />
                <rect x="-13" y="3" width="1.5" height="2" fill="#ef4444" />
              </g>
            </svg>

            {/* Glowing HUD Scanline effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-blue-500/0 via-blue-500/3 to-blue-500/0 h-[200%] animate-scan pointer-events-none z-15" />

            {/* Cyber Telemetry Corner Overlays */}
            <div className="absolute top-8 left-8 z-20 hidden md:flex flex-col gap-1.5 text-slate-500 font-mono text-[9px] tracking-widest uppercase">
              <div className="flex items-center gap-2 text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="font-bold">SYSTEM OVERVIEW</span>
              </div>
              <p>HOST ID: LOGIFLEET_M_02</p>
              <p>GEO_LOCATIONS: SÃO PAULO / MT / GO</p>
              <p>GRID_SCAN: STANDBY</p>
            </div>

            <div className="absolute top-8 right-8 z-20 hidden md:flex flex-col gap-1.5 items-end text-slate-500 font-mono text-[9px] tracking-widest uppercase text-right">
              <div className="flex items-center gap-2 text-pink-500">
                <Wifi size={10} className="animate-pulse" />
                <span className="font-bold">TELEMETRY: ACTIVE</span>
              </div>
              <p>SIGNAL: EXCELLENT (-48dBm)</p>
              <p>SATELLITE COUNT: 14/14</p>
              <p>REFRESH RATE: 60Hz</p>
            </div>

            <div className="absolute bottom-8 left-8 z-20 hidden md:flex flex-col gap-1 text-slate-500 font-mono text-[9px] tracking-widest uppercase">
              <div className="flex items-center gap-2">
                <Activity size={10} className="text-emerald-500 animate-[pulse_1.5s_infinite]" />
                <p>SIMULATION ENGINE: ONLINE</p>
              </div>
            </div>

            <div className="absolute bottom-8 right-8 z-20 hidden md:flex items-center gap-3 text-slate-500 font-mono text-[9px] tracking-widest uppercase">
              <span>LAT: -14.235°</span>
              <span>LNG: -51.925°</span>
            </div>

            {/* CENTER GLASS CARD & INICIAR BUTTON */}
            <div className="relative z-30 flex flex-col items-center max-w-md px-6 text-center">
              <div className="absolute -inset-10 bg-gradient-to-r from-blue-500/5 to-pink-500/5 rounded-full blur-3xl opacity-50 animate-pulse pointer-events-none" />
              
              <div className="relative w-20 h-20 mb-6 flex items-center justify-center rounded-3xl bg-slate-900/80 border border-white/10 shadow-[0_0_30px_rgba(59,130,246,0.15)] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-pink-500/10" />
                <Compass className="w-10 h-10 text-blue-400 animate-[spin_20s_linear_infinite]" />
                <div className="absolute -inset-1.5 border border-dashed border-blue-500/20 rounded-3xl animate-[spin_30s_linear_infinite_reverse]" />
              </div>

              <h1 className="font-display font-black text-3xl md:text-4xl text-white tracking-tight mb-2 uppercase">
                Logi<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-pink-500">Fleet</span> Mapas
              </h1>
              <p className="text-slate-400 font-medium text-xs md:text-sm tracking-wide mb-8 max-w-xs leading-relaxed">
                Rastreamento em tempo real de frotas, rotas e documentação de veículos com telemetria direta via satélite.
              </p>

              <button
                onClick={() => setMapStarted(true)}
                className="relative group px-10 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-pink-600 font-black text-xs text-white uppercase tracking-widest shadow-[0_0_40px_rgba(99,102,241,0.4)] hover:shadow-[0_0_50px_rgba(99,102,241,0.65)] hover:scale-[1.04] active:scale-[0.98] transition-all duration-300 cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-out" />
                
                <div className="flex items-center justify-center gap-3 relative z-10">
                  <Play size={13} fill="white" className="text-white animate-pulse" />
                  <span>Iniciar Monitoramento</span>
                </div>
              </button>
              
              <span className="mt-4 text-[9px] font-black text-slate-500 uppercase tracking-widest animate-pulse">
                Clique para conectar ao sistema
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {mapStarted && (
        <>
          {/* Top Controls Overlay */}
          <div className="absolute top-4 left-4 z-[1001] flex flex-col gap-3 pointer-events-none items-start">
        {/* Map Type Selector */}
        <div className="glass p-1.5 rounded-2xl shadow-xl border border-white/45 flex items-center gap-1 pointer-events-auto">
          <div className="px-3 py-1.5 flex items-center gap-2 border-r border-slate-200/50 mr-1 shrink-0">
            <Layers size={14} className="text-slate-500" />
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Mapa</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {MAP_LAYER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setMapType(opt.id)}
                title={opt.desc}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all duration-300 cursor-pointer whitespace-nowrap",
                  mapType === opt.id 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-500/35 scale-[1.02]" 
                    : "text-slate-500 hover:bg-white/60 hover:text-slate-800"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Zoom Controls & Action Buttons */}
        <div className="flex flex-col gap-2 pointer-events-auto items-start">
          <ZoomControl map={map} />
          <button 
            onClick={() => setShowVehicleList(!showVehicleList)}
            className={cn(
              "w-11 h-11 flex items-center justify-center rounded-xl shadow-xl border transition-all duration-300 cursor-pointer",
              showVehicleList 
                ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/35 scale-105" 
                : "glass border-white/45 text-slate-700 hover:text-blue-600 hover:bg-white hover:scale-105"
            )}
            title={showVehicleList ? "Ocultar Lista de Veículos" : "Mostrar Lista de Veículos"}
          >
            <Filter size={18} />
          </button>
          {onResetFilters && (
            <button 
              onClick={() => {
                setSelectedVehicleId(null);
                onResetFilters();
                setRecenterTrigger(prev => prev + 1);
              }}
              className="w-11 h-11 flex items-center justify-center rounded-xl shadow-xl border glass border-white/45 text-slate-700 hover:text-red-500 hover:bg-white hover:scale-105 transition-all duration-300 cursor-pointer"
              title="Redefinir Filtros do Mapa"
            >
              <RotateCcw size={17} />
            </button>
          )}
        </div>
      </div>

      {/* Vehicle List Sidebar Overlay */}
      <AnimatePresence>
        {showVehicleList && (
          <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            className="absolute top-4 bottom-24 left-4 w-80 z-[1002] glass rounded-3xl shadow-2xl border border-white/40 overflow-hidden flex flex-col pointer-events-auto"
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white/50">
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-widest">Veículos na Área</h3>
              <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-full">{geocodedVehicles.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-hide">
              {geocodedVehicles.map(v => (
                <div 
                  key={v.id}
                  onClick={() => {
                    setSelectedVehicleId(v.id);
                    setRecenterTrigger(prev => prev + 1);
                  }}
                  className={cn(
                    "p-3 rounded-2xl border transition-all cursor-pointer group",
                    selectedVehicleId === v.id 
                      ? "bg-blue-50 border-blue-200" 
                      : "bg-white/50 border-transparent hover:border-blue-200 hover:bg-white"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      v.overallStatus === 'ok' ? "bg-green-500" :
                      v.overallStatus === 'vencido' ? "bg-red-500" : "bg-amber-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <p className="font-black text-slate-900 text-xs tracking-wide">{v.plate}</p>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{v.fleet}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-500 mt-0.5">
                        <span className="truncate max-w-[110px] font-medium">{v.cityBase || v.operation}</span>
                        <span className="truncate max-w-[100px] text-[9px] text-slate-400 font-semibold">{v.driver}</span>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>
              ))}
              {geocodedVehicles.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                  <Truck size={32} className="mb-2 opacity-20" />
                  <p className="text-xs font-bold uppercase tracking-widest">Nenhum veículo encontrado</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Header/Stats - Floating Style at Bottom */}
      <div className="absolute bottom-8 left-4 right-4 flex items-center justify-between z-[1000] pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="glass px-4 py-2.5 rounded-3xl shadow-2xl border border-white/45 flex items-center gap-3.5 overflow-x-auto max-w-[70vw] scrollbar-hide">
            <button 
              onClick={() => {
                setSelectedVehicleId(null);
                setRecenterTrigger(prev => prev + 1);
              }}
              className="w-8 h-8 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer shadow-sm"
              title="Centralizar Mapa"
            >
              <Maximize size={14} />
            </button>
            <div className="h-5 w-px bg-slate-200 shrink-0" />
            <button
              onClick={() => onResetFilters ? onResetFilters() : onSelectOperation && onSelectOperation("")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest shrink-0 shadow-md transition-all cursor-pointer",
                selectedOperation.length === 0
                  ? "bg-slate-950 text-white ring-2 ring-blue-500/40"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-900 hover:text-white"
              )}
              title="Ver todos os veículos (Limpar filtro de operação)"
            >
              <Truck size={12} className="text-blue-400" />
              <span>{stats.total}</span>
              {selectedOperation.length > 0 && (
                <span className="text-[8px] bg-blue-500/30 text-blue-300 px-1 rounded ml-0.5">FILTRADO</span>
              )}
            </button>
            <div className="h-5 w-px bg-slate-200 shrink-0" />
            {routePath.length === 2 && (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-extrabold uppercase tracking-widest shrink-0 border border-blue-100 shadow-sm">
                  <MapPin size={12} />
                  <span>Rota Ativa</span>
                </div>
                <div className="h-5 w-px bg-slate-200 shrink-0" />
              </>
            )}
            <div className="flex items-center gap-2.5 shrink-0 py-0.5 overflow-x-auto scrollbar-hide">
              {displayOperations.map(([op, count]) => {
                const isSelected = selectedOperation.includes(op);
                return (
                  <button
                    key={op}
                    onClick={() => onSelectOperation && onSelectOperation(op)}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap px-3 py-1 rounded-xl border shadow-sm shrink-0 transition-all cursor-pointer hover:scale-105 active:scale-95",
                      isSelected
                        ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-400/50 shadow-blue-500/20"
                        : "bg-white/90 text-slate-700 border-slate-200 hover:bg-white hover:border-blue-200"
                    )}
                    title={`Filtrar pela operação ${op}`}
                  >
                    <div 
                      className="w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm shrink-0" 
                      style={{ backgroundColor: OPERATION_COLORS[op] || OPERATION_COLORS.default }} 
                    />
                    <span className={cn(
                      "text-[10px] font-extrabold uppercase tracking-wide",
                      isSelected ? "text-white" : "text-slate-700"
                    )}>
                      {op}
                    </span>
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-lg min-w-[20px] text-center",
                      isSelected ? "bg-white/20 text-white" : "text-blue-600 bg-blue-50/70"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        
        {isGeocoding && (
          <div className="glass px-4 py-2 rounded-2xl shadow-xl border border-white/40 flex items-center gap-2 text-blue-600 text-[10px] font-black uppercase tracking-widest animate-pulse pointer-events-auto">
            <Clock size={12} />
            <span>Sincronizando...</span>
          </div>
        )}

        {simulationActive && (
          <div className="glass px-4 py-2 rounded-2xl shadow-xl border border-green-200 flex items-center gap-2 text-green-600 text-[10px] font-black uppercase tracking-widest pointer-events-auto">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
            <span>Simulação Ativa</span>
          </div>
        )}

        {routePath.length === 2 && (
          <div className="glass px-4 py-2 rounded-2xl shadow-xl border border-blue-200 flex flex-col items-center gap-0.5 text-blue-600 pointer-events-auto">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-widest">Rota Simulada</span>
            </div>
            <div className="text-lg font-black leading-none">
              {Math.round(L.latLng(routePath[0]).distanceTo(L.latLng(routePath[1])) / 1000)} KM
            </div>
            <span className="text-[8px] font-bold text-slate-400 uppercase">Distância em linha reta</span>
          </div>
        )}
      </div>

      {/* Map Container */}
      <div className="flex-1 relative z-0 overflow-hidden" ref={mapContainerRef}>
        <MapContainer 
          center={[-15.7801, -47.9292]} // Center of Brazil (Brasília)
          zoom={4} 
          style={{ 
            height: "100%", 
            width: "100%", 
            background: (mapType === 'dark' || mapType === 'cyber' || mapType === 'esri-dark') ? "#070b14" : "#f8fafc" 
          }}
          scrollWheelZoom={true}
          zoomControl={false}
        >
          {/* 1. Modo Escuro (Dark Midnight): 100% Nativo via OpenStreetMap sem exigência de API Key */}
          {mapType === 'dark' && (
            <TileLayer
              key="dark-midnight-osm"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              className="leaflet-tile-dark-midnight"
              attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
              maxZoom={19}
            />
          )}

          {/* 2. Modo Cyber HUD Neon: Estilo Tático Noturno sem API Key */}
          {mapType === 'cyber' && (
            <TileLayer
              key="cyber-osm"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              className="leaflet-tile-cyber"
              attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
              maxZoom={19}
            />
          )}

          {/* 3. Satélite Híbrido HD com Vias e Cidades */}
          {mapType === 'satellite' && (
            <>
              <TileLayer
                key="sat-base"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
                maxZoom={18}
              />
              <TileLayer
                key="sat-reference"
                url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                attribution=""
                maxZoom={18}
              />
            </>
          )}

          {/* 4. Logística & Vias: Malha Rodoviária Oficial Esri (100% livre de API Key) */}
          {mapType === 'streets' && (
            <TileLayer
              key="esri-streets"
              url="https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, USGS, EPA, NPS, NRCAN"
              maxZoom={18}
            />
          )}

          {/* 5. Esri Canvas Dark Gray Clássico */}
          {mapType === 'esri-dark' && (
            <>
              <TileLayer
                key="esri-dark-base"
                url="https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
                maxZoom={16}
              />
              <TileLayer
                key="esri-dark-reference"
                url="https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
                attribution=""
                maxZoom={16}
              />
            </>
          )}

          {/* 6. OpenStreetMap Claro Padrão */}
          {mapType === 'light' && (
            <TileLayer
              key="light-osm"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
              maxZoom={19}
            />
          )}

          {/* 7. Relevo Topográfico */}
          {mapType === 'topo' && (
            <TileLayer
              key="topo-base"
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              attribution="Map data: &copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href='https://opentopomap.org'>OpenTopoMap</a>"
              maxZoom={17}
            />
          )}
          
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={50}
            zoomToBoundsOnClick={true}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            onMouseOver={handleClusterMouseOver}
            onMouseOut={handleClusterMouseOut}
            onClick={handleClusterClick}
            iconCreateFunction={(cluster) => {
              const count = cluster.getChildCount();
              const vehiclesInCluster = getVehiclesFromCluster(cluster);
              const hasVencido = vehiclesInCluster.some(v => v.overallStatus === "vencido");
              const hasAlerta = vehiclesInCluster.some(v => v.overallStatus === "alerta");

              const neonColor = hasVencido ? "#ef4444" : hasAlerta ? "#f59e0b" : "#00f0ff";
              const neonGlow = hasVencido ? "rgba(239, 68, 68, 0.65)" : hasAlerta ? "rgba(245, 158, 11, 0.65)" : "rgba(0, 240, 255, 0.65)";

              return L.divIcon({
                html: `
                  <div class="neon-cluster-node group cursor-pointer relative" style="width: 48px; height: 48px; transform: translate3d(0,0,0);">
                    <div class="absolute -inset-2.5 rounded-full blur-md opacity-75 animate-pulse pointer-events-none" 
                         style="background: radial-gradient(circle, ${neonGlow} 0%, transparent 70%);"></div>
                    <div class="absolute -inset-1 rounded-full border border-dashed pointer-events-none" 
                         style="border-color: ${neonColor}; opacity: 0.7; animation: spin 14s linear infinite;"></div>
                    <div class="relative w-full h-full rounded-full flex flex-col items-center justify-center border-2 backdrop-blur-xl transition-all duration-300 group-hover:scale-110 shadow-2xl" 
                         style="border-color: ${neonColor}; background: radial-gradient(circle at 35% 25%, #1e293b 0%, #0a0f1d 75%, #030712 100%); box-shadow: 0 0 20px ${neonGlow}, inset 0 2px 4px rgba(255,255,255,0.4);">
                      <div class="absolute top-1 left-2.5 right-2.5 h-3 rounded-full bg-gradient-to-b from-white/40 to-transparent pointer-events-none"></div>
                      <span class="font-black text-xs font-mono tracking-tight text-white leading-none z-10" style="text-shadow: 0 0 8px ${neonColor}, 0 0 16px ${neonColor};">
                        ${count}
                      </span>
                      <span class="text-[7px] font-black tracking-widest uppercase scale-90 leading-none mt-0.5" style="color: ${neonColor};">
                        PLACAS
                      </span>
                      ${hasVencido ? `
                        <div class="absolute -top-1 -right-1 flex h-3.5 w-3.5 pointer-events-none">
                          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 border border-white shadow-[0_0_8px_#ef4444]"></span>
                        </div>
                      ` : hasAlerta ? `
                        <div class="absolute -top-1 -right-1 flex h-3 w-3 pointer-events-none">
                          <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-400 border border-white shadow-[0_0_6px_#f59e0b]"></span>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `,
                className: "custom-cluster-icon",
                iconSize: [48, 48],
                iconAnchor: [24, 24]
              });
            }}
          >
            {geocodedVehicles.map((vehicle) => {
              const pos = simulatedPositions[vehicle.id] || [vehicle.lat!, vehicle.lng!];
              if (!pos[0] || !pos[1]) return null;
              
              const color = OPERATION_COLORS[vehicle.operation] || OPERATION_COLORS.default;
              const icon = L.divIcon({
                html: `
                  <div class="relative group">
                    <div class="absolute -inset-2 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-all duration-500" style="background-color: ${color}44;"></div>
                    <div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 4px 10px ${color}66; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);" class="${simulationActive ? 'animate-pulse scale-110' : 'group-hover:scale-125'}"></div>
                    ${simulationActive ? `<div class="absolute -inset-1.5 border-2 rounded-full animate-ping" style="border-color: ${color}33;"></div>` : ''}
                  </div>
                `,
                className: "custom-marker-icon",
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              });

              return (
                <Marker 
                  key={vehicle.id} 
                  position={pos as [number, number]}
                  icon={icon}
                  eventHandlers={{
                    add: (e) => {
                      (e.target as any).vehicleData = vehicle;
                    },
                    mouseover: (e) => {
                      if (activeClusterTooltip?.isPinned) return;
                      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                      const target = e.target;
                      const latLng = target.getLatLng();
                      setTooltipScreenPos(getScreenCoordinates(latLng));
                      setActiveClusterTooltip({
                        cluster: target,
                        latLng,
                        vehicles: [vehicle],
                        count: 1,
                        isPinned: false
                      });
                    },
                    mouseout: () => {
                      handleClusterMouseOut();
                    },
                    click: (e) => {
                      const target = e.target;
                      const latLng = target.getLatLng();
                      setTooltipScreenPos(getScreenCoordinates(latLng));
                      setActiveClusterTooltip(prev => {
                        if (prev && prev.cluster === target && prev.isPinned) {
                          return null;
                        }
                        return {
                          cluster: target,
                          latLng,
                          vehicles: [vehicle],
                          count: 1,
                          isPinned: true
                        };
                      });
                    }
                  }}
                />
              );
            })}
          </MarkerClusterGroup>

          {/* Base Central / Garagem - Ribeirão Preto */}
          <Marker 
            position={[-21.1775, -47.8103]}
            icon={L.divIcon({
              html: `
                <div class="relative group cursor-pointer">
                  <div class="absolute -inset-2 bg-blue-500/25 rounded-full animate-ping pointer-events-none"></div>
                  <div class="relative flex items-center justify-center w-8 h-8 rounded-2xl bg-slate-900 border-2 border-blue-400 text-blue-400 shadow-xl shadow-blue-500/30 group-hover:scale-110 transition-transform">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                  </div>
                </div>
              `,
              className: "garage-marker-icon",
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })}
          >
            <Popup className="custom-popup">
              <div className="p-3 min-w-[220px]">
                <div className="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                  <span className="text-[10px] font-black uppercase tracking-widest">Base Operacional</span>
                </div>
                <h3 className="font-black text-slate-900 text-base leading-tight">Garagem Central</h3>
                <p className="text-xs font-bold text-blue-600 mb-2">Ribeirão Preto / SP</p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Sede operacional e garagem principal de apoio à frota e manutenção.
                </p>
              </div>
            </Popup>
          </Marker>

          {routePath.length === 2 && (
            <>
              <Polyline 
                positions={routePath} 
                color="#3b82f6" 
                weight={4} 
                dashArray="10, 10" 
                opacity={0.6}
              />
              <Marker position={routePath[0]} icon={L.divIcon({
                html: `<div style="background-color: #22c55e; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.3);"></div>`,
                className: "route-marker",
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              })}>
                <Popup>Origem: {originCity}</Popup>
              </Marker>
              <Marker position={routePath[1]} icon={L.divIcon({
                html: `<div style="background-color: #ef4444; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.3);"></div>`,
                className: "route-marker",
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              })}>
                <Popup>Destino: {destinationCity}</Popup>
              </Marker>
            </>
          )}
          
          <MapController 
            vehicles={geocodedVehicles} 
            routePath={routePath} 
            selectedCity={selectedCity} 
            recenterTrigger={recenterTrigger} 
            selectedVehicleId={selectedVehicleId}
            simulatedPositions={simulatedPositions}
            onMapReady={setMap}
          />
        </MapContainer>

        {/* 3D Animated Neon Cluster Tooltip Overlay */}
        <AnimatePresence>
          {activeClusterTooltip && (
            <NeonClusterTooltip 
              vehicles={activeClusterTooltip.vehicles}
              totalCount={activeClusterTooltip.count}
              screenPos={tooltipScreenPos}
              containerDimensions={mapContainerDimensions}
              isPinned={activeClusterTooltip.isPinned}
              onTogglePin={() => setActiveClusterTooltip(prev => prev ? { ...prev, isPinned: !prev.isPinned } : null)}
              onClose={() => setActiveClusterTooltip(null)}
              onExpandCluster={handleExpandCluster}
              onSelectVehicle={(veh) => {
                setSelectedVehicleId(veh.id);
                const vPos = simulatedPositions[veh.id] || [veh.lat!, veh.lng!];
                if (vPos[0] && vPos[1] && map) {
                  map.setView(vPos as [number, number], 16, { animate: true });
                }
              }}
              onMouseEnter={handleTooltipMouseEnter}
              onMouseLeave={handleTooltipMouseLeave}
              operationColors={OPERATION_COLORS}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  )}
</div>
  );
}

// Helper component to handle map view changes
function MapController({ 
  vehicles, 
  routePath, 
  selectedCity, 
  recenterTrigger, 
  selectedVehicleId,
  simulatedPositions,
  onMapReady
}: { 
  vehicles: Vehicle[], 
  routePath: [number, number][], 
  selectedCity: string[], 
  recenterTrigger: number,
  selectedVehicleId: string | null,
  simulatedPositions: Record<string, [number, number]>,
  onMapReady?: (map: L.Map) => void
}) {
  const map = useMap();

  useEffect(() => {
    if (onMapReady) {
      onMapReady(map);
    }
  }, [map, onMapReady]);

  useEffect(() => {
    if (selectedVehicleId) {
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      if (vehicle) {
        const pos = simulatedPositions[selectedVehicleId] || [vehicle.lat!, vehicle.lng!];
        if (pos[0] && pos[1]) {
          map.setView(pos as [number, number], 16, { animate: true, duration: 1 });
          return;
        }
      }
    }

    if (selectedCity.length === 1) {
      // Find city coordinates for the single selected city
      const city = selectedCity[0];
      const cityCoords = CITY_COORDINATES[city.toUpperCase().trim()];
      if (cityCoords) {
        map.setView(cityCoords, 14, { animate: true, duration: 1.5 });
      }
    } else if (selectedCity.length > 1) {
      // Fit bounds to show all selected cities if possible
      const citiesWithCoords = selectedCity
        .map(c => CITY_COORDINATES[c.toUpperCase().trim()])
        .filter(coords => !!coords);
      
      if (citiesWithCoords.length > 0) {
        const bounds = L.latLngBounds(citiesWithCoords as [number, number][]);
        map.fitBounds(bounds, { padding: [50, 50], animate: true });
      }
    } else if (routePath.length === 2) {
      const bounds = L.latLngBounds(routePath);
      map.fitBounds(bounds, { padding: [100, 100], maxZoom: 10 });
    } else if (vehicles.length > 0) {
      const bounds = L.latLngBounds(vehicles.map(v => [v.lat!, v.lng!]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [vehicles, routePath, map, selectedCity, recenterTrigger]);

  return null;
}

function ZoomControl({ map }: { map: L.Map | null }) {
  return (
    <div className="glass flex flex-col rounded-xl shadow-xl border border-white/45 overflow-hidden w-11 shrink-0">
      <button 
        onClick={() => map?.zoomIn()}
        className="w-11 h-11 flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer"
        title="Aumentar Zoom"
      >
        <Plus size={18} />
      </button>
      <button 
        onClick={() => map?.zoomOut()}
        className="w-11 h-11 flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors cursor-pointer"
        title="Diminuir Zoom"
      >
        <Minus size={18} />
      </button>
    </div>
  );
}
