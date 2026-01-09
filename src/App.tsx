import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Map,
  useMap,
  MapControls,
  MapMarker,
  MarkerContent,
  MapRoute,
  MarkerTooltip,
  MapPopup,
  type MapRef,
} from "@/components/ui/map";
import {
  Menu,
  Search,
  MapPin,
  Flag,
  X,
  Trash2,
  Clock,
  Route as RouteIcon,
  Loader2,
  Navigation,
  Locate,
  Mountain,
  Pencil,
} from "lucide-react";
import React, { useState, useEffect, useCallback, useRef } from "react";
import "./index.css";
import { Input } from "./components/ui/input";
import { ScrollArea } from "./components/ui/scroll-area";
import { Toaster, toast } from "./components/ui/sonner";

// --- TYPES ---
interface Blip { id: number; longitude: number; latitude: number; text: string; }
interface RouteData { coordinates: [number, number][]; duration: number; distance: number; }
interface Friend { id: number; name: string; avatar: string; status: string; lastMessage: string; unread: number; location: { longitude: number; latitude: number; }; }

// --- MOCK DATA & SIMULATION ---
const currentUser = { name: "Fractal", avatar: "https://github.com/shadcn.png" };
const initialFriends: Friend[] = [
  { id: 1, name: "Alice", avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704d", status: "online", lastMessage: "See you on the map!", unread: 2, location: { longitude: -122.41, latitude: 37.78 } },
  { id: 2, name: "Bob", avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704e", status: "offline", lastMessage: "Let's catch up later.", unread: 0, location: { longitude: -122.42, latitude: 37.79 } },
];
const alicePath: [number, number][] = [
  [-122.41, 37.78], [-122.415, 37.782], [-122.42, 37.785], [-122.425, 37.782], [-122.42, 37.78], [-122.415, 37.778], [-122.41, 37.78]
];

// --- HELPERS ---
function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// --- API ---
async function fetchRoutes(waypoints: [number, number][]): Promise<RouteData[]> {
  if (waypoints.length < 2) return [];
  const coords = waypoints.map(p => p.join(',')).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=true`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    return data.routes?.map((r: any) => ({ coordinates: r.geometry.coordinates, duration: r.duration, distance: r.distance })) || [];
  } catch (error) {
    console.error("Failed to fetch routes from OSRM:", error);
    return [];
  }
}

// --- UI COMPONENTS ---
const FriendList = ({ friends, onFlyTo, onToggle }: { friends: Friend[], onFlyTo: (coords: { longitude: number, latitude: number }) => void, onToggle: () => void }) => (
  <>
    <div className="p-4 flex items-center justify-between border-b border-border flex-shrink-0">
      <div className="flex items-center gap-3"><Avatar src={currentUser.avatar} fallback={currentUser.name} /><h2 className="font-semibold">{currentUser.name}</h2></div>
      <Button variant="ghost" size="icon-sm" onClick={onToggle} className="md:hidden"><X className="size-5" /></Button>
    </div>
    <div className="p-4 border-b border-border flex-shrink-0">
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" /><Input placeholder="Search friends or chats" className="pl-9" /></div>
    </div>
    <ScrollArea className="flex-1">
      <div className="p-2">
        {friends.map(friend => (
          <div key={friend.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors" onClick={() => onFlyTo(friend.location)}>
            <div className="relative">
              <Avatar src={friend.avatar} fallback={friend.name} />
              <span className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ${friend.status === "online" ? "bg-green-500" : "bg-gray-500"} ring-2 ring-card`} />
            </div>
            <div className="flex-1"><h3 className="font-semibold text-sm">{friend.name}</h3><p className="text-xs text-muted-foreground truncate">{friend.lastMessage}</p></div>
            {friend.unread > 0 && <div className="bg-primary text-primary-foreground text-xs rounded-full size-5 flex items-center justify-center font-semibold">{friend.unread}</div>}
          </div>
        ))}
      </div>
    </ScrollArea>
  </>
);

const MapInteractionController = ({ onMapClick, isDrawing }: { onMapClick: (e: maplibregl.MapMouseEvent) => void, isDrawing: boolean }) => {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (isLoaded && map) {
      map.on('click', onMapClick);
      map.getCanvas().style.cursor = isDrawing ? 'crosshair' : '';
      return () => { map.off('click', onMapClick); };
    }
  }, [map, isLoaded, onMapClick, isDrawing]);
  return null;
};

const DrawnPolygonLayer = ({ drawnPolygon }: { drawnPolygon: [number, number][] }) => {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!isLoaded || !map) return;

    const sourceId = 'drawn-polygon';
    const fillLayerId = 'drawn-polygon-fill';
    const strokeLayerId = 'drawn-polygon-stroke';

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;

    if (!source) {
      map.addSource(sourceId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} } });
      map.addLayer({ id: fillLayerId, type: 'fill', source: sourceId, paint: { 'fill-color': '#9333ea', 'fill-opacity': 0.3 } });
      map.addLayer({ id: strokeLayerId, type: 'line', source: sourceId, paint: { 'line-color': '#9333ea', 'line-width': 2 } });
    } else {
      const polyCoords = drawnPolygon.length > 2 ? [[...drawnPolygon, drawnPolygon[0]]] : [drawnPolygon];
      source.setData({ type: 'Feature', geometry: { type: 'Polygon', coordinates: polyCoords }, properties: {} });
    }
  }, [drawnPolygon, map, isLoaded]);

  return null;
}

// --- MAIN APP COMPONENT ---
export function App() {
  const mapRef = useRef<MapRef>(null);
  const [friends, setFriends] = useState(initialFriends);
  const [blips, setBlips] = useState<Blip[]>([{ id: 1, longitude: -122.45, latitude: 37.77, text: "Cool graffiti" }]);
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [selection, setSelection] = useState<{ lng: number; lat: number } | null>(null);
  const [selectedWaypoint, setSelectedWaypoint] = useState<{ index: number; lng: number; lat: number } | null>(null);
  const [selectedBlip, setSelectedBlip] = useState<Blip | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnPolygon, setDrawnPolygon] = useState<[number, number][]>([]);

  // Simulate Alice moving
  useEffect(() => {
    const interval = setInterval(() => {
      setFriends(prevFriends => {
        const alice = prevFriends.find(f => f.id === 1);
        if (!alice) return prevFriends;
        const currentIndex = alicePath.findIndex(p => p[0] === alice.location.longitude && p[1] === alice.location.latitude);
        const nextIndex = (currentIndex + 1) % alicePath.length;
        const nextLocation = { longitude: alicePath[nextIndex][0], latitude: alicePath[nextIndex][1] };
        return prevFriends.map(f => f.id === 1 ? { ...f, location: nextLocation } : f);
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleMapClick = useCallback((e: maplibregl.MapMouseEvent) => {
    if (isDrawing) {
      setDrawnPolygon(prev => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
      return;
    }
    const target = e.originalEvent.target as HTMLElement;
    if (target.closest('.maplibregl-marker')) return;
    setSelection({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    setSelectedWaypoint(null);
    setSelectedBlip(null);
  }, [isDrawing]);

  const addBlip = useCallback(() => { if (selection) { setBlips(p => [...p, { id: Date.now(), ...selection, text: `Blip #${p.length + 1}` }]); setSelection(null); } }, [selection]);
  const addWaypoint = useCallback(() => { if (selection) { setWaypoints(p => [...p, [selection.lng, selection.lat]]); setSelection(null); } }, [selection]);
  const deleteWaypoint = useCallback((i: number) => { setWaypoints(p => p.filter((_, idx) => idx !== i)); setSelectedWaypoint(null); }, []);
  const routeToBlip = useCallback(() => { if (userLocation && selectedBlip) { setWaypoints([userLocation, [selectedBlip.longitude, selectedBlip.latitude]]); setSelectedBlip(null); } }, [userLocation, selectedBlip]);
  const flyTo = useCallback((location: { longitude: number, latitude: number }) => { mapRef.current?.flyTo({ center: [location.longitude, location.latitude], zoom: 14 }); }, []);
  const toggleDrawing = () => {
    setIsDrawing(!isDrawing);
    if (isDrawing) { /* Finished drawing */ } 
    else { setDrawnPolygon([]); setWaypoints([]); }
  };

  useEffect(() => {
    if (waypoints.length < 2) { setRoutes([]); return; }
    let isMounted = true;
    setIsLoadingRoute(true);
    fetchRoutes(waypoints).then(d => { if (isMounted) { setRoutes(d); setSelectedRouteIndex(0); setIsLoadingRoute(false); } });
    return () => { isMounted = false; };
  }, [waypoints]);

  const toggle3D = () => {
    const newIs3D = !is3D;
    setIs3D(newIs3D);
    mapRef.current?.easeTo({ pitch: newIs3D ? 60 : 0, bearing: newIs3D ? -20 : 0 });
  };

  const handleLocateError = useCallback((error: GeolocationPositionError) => {
    let message = "Could not determine your location.";
    if (error.code === error.PERMISSION_DENIED) {
      message = "Location access was denied. Please enable it in your browser settings.";
    }
    toast.error(message);
  }, []);

  const sortedRoutes = [...routes].sort((a, b) => (routes.indexOf(a) === selectedRouteIndex ? 1 : -1));

  return (
    <div className="h-screen w-screen bg-background text-foreground font-sans antialiased overflow-hidden">
      <Toaster position="top-center" richColors />
      <div className="flex h-full w-full">
        <aside className={` ${isSidebarOpen ? "flex" : "hidden"} md:flex flex-col absolute md:relative z-40 w-80 h-full bg-card/95 backdrop-blur-sm border-r border-border`}>
          <FriendList friends={friends} onFlyTo={flyTo} onToggle={() => setIsSidebarOpen(false)} />
        </aside>

        <main className="flex-1 flex flex-col relative">
          <header className="md:hidden p-2 flex items-center justify-between absolute top-0 left-0 right-0 z-30 bg-background/50 backdrop-blur-sm">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}><Menu /></Button>
            <h1 className="font-semibold text-lg">GeoChat</h1>
            <Avatar src={currentUser.avatar} fallback="F" size="sm" />
          </header>

          <div className="flex-1 relative">
            <Map ref={mapRef} initialViewState={{ longitude: -122.4, latitude: 37.79, zoom: 13 }}>
              <MapInteractionController onMapClick={handleMapClick} isDrawing={isDrawing} />
              <DrawnPolygonLayer drawnPolygon={drawnPolygon} />
              <MapControls position="top-right" showZoom showCompass showLocate onLocate={c => setUserLocation([c.longitude, c.latitude])} onLocateError={handleLocateError} />
              
              {userLocation && <MapMarker longitude={userLocation[0]} latitude={userLocation[1]}><MarkerContent><Locate className="size-5 text-blue-500" /></MarkerContent><MarkerTooltip>Your Location</MarkerTooltip></MapMarker>}
              {friends.map(f => <MapMarker key={`friend-${f.id}`} longitude={f.location.longitude} latitude={f.location.latitude}><MarkerContent><Avatar src={f.avatar} fallback={f.name.charAt(0)} size="sm" /></MarkerContent><MarkerTooltip>{f.name}</MarkerTooltip></MapMarker>)}
              {blips.map(b => <MapMarker key={`blip-${b.id}`} longitude={b.longitude} latitude={b.latitude} onClick={() => setSelectedBlip(b)}><MarkerContent><MapPin className="text-red-500 size-8 cursor-pointer" /></MarkerContent></MapMarker>)}
              {waypoints.map((wp, i) => <MapMarker key={`waypoint-${i}`} longitude={wp[0]} latitude={wp[1]} onClick={() => setSelectedWaypoint({ index: i, lng: wp[0], lat: wp[1] })}><MarkerContent><div className="bg-background rounded-full p-1 shadow-md flex items-center justify-center size-6 cursor-pointer"><span className="text-xs font-bold">{i + 1}</span></div></MarkerContent></MapMarker>)}
              {sortedRoutes.map((r) => {
                const originalIndex = routes.indexOf(r);
                return <MapRoute key={originalIndex} coordinates={r.coordinates} color={originalIndex === selectedRouteIndex ? "#3b82f6" : "#94a3b8"} width={6} opacity={0.8} onClick={() => setSelectedRouteIndex(originalIndex)} />;
              })}

              {selection && <MapPopup longitude={selection.lng} latitude={selection.lat} onClose={() => setSelection(null)} closeButton><div className="flex flex-col gap-2"><h3 className="font-semibold text-center">Add to map</h3><Button onClick={addBlip} size="sm"><MapPin className="size-4 mr-2" /> Add Blip</Button><Button onClick={addWaypoint} size="sm"><Flag className="size-4 mr-2" /> Add Waypoint</Button></div></MapPopup>}
              {selectedWaypoint && <MapPopup longitude={selectedWaypoint.lng} latitude={selectedWaypoint.lat} onClose={() => setSelectedWaypoint(null)} closeButton><div className="flex flex-col gap-2"><h3 className="font-semibold text-center">Waypoint {selectedWaypoint.index + 1}</h3><Button onClick={() => deleteWaypoint(selectedWaypoint.index)} variant="destructive" size="sm"><Trash2 className="size-4 mr-2" /> Delete</Button></div></MapPopup>}
              {selectedBlip && <MapPopup longitude={selectedBlip.longitude} latitude={selectedBlip.latitude} onClose={() => setSelectedBlip(null)} closeButton><div className="flex flex-col gap-2"><h3 className="font-semibold text-center">{selectedBlip.text}</h3><Button onClick={routeToBlip} size="sm" disabled={!userLocation}><Navigation className="size-4 mr-2" /> Route from my location</Button></div></MapPopup>}
            </Map>
          </div>

          <div className="absolute top-16 md:top-3 left-3 z-10 flex flex-col gap-2 items-start">
            <div className="flex gap-2">
              <Button onClick={toggle3D} variant={is3D ? "default" : "secondary"} size="sm" className="shadow-lg"><Mountain className="size-4 mr-1.5" /> 3D</Button>
              <Button onClick={toggleDrawing} variant={isDrawing ? "default" : "secondary"} size="sm" className="shadow-lg"><Pencil className="size-4 mr-1.5" /> {isDrawing ? "Finish Drawing" : "Draw Area"}</Button>
            </div>
            {routes.length > 0 && (
              <div className="flex flex-col gap-2 p-2 rounded-md bg-background/80 backdrop-blur-sm border shadow-lg">
                {routes.map((route, index) => (
                  <Button key={index} variant={index === selectedRouteIndex ? "default" : "secondary"} size="sm" onClick={() => setSelectedRouteIndex(index)} className="justify-start gap-3 h-auto py-1.5 px-3">
                    <div className="flex items-center gap-1.5"><Clock className="size-3.5" /><span className="font-medium">{formatDuration(route.duration)}</span></div>
                    <div className="flex items-center gap-1.5 text-xs opacity-80"><RouteIcon className="size-3" />{formatDistance(route.distance)}</div>
                  </Button>
                ))}
              </div>
            )}
            {waypoints.length > 0 && !isDrawing && <Button onClick={() => { setWaypoints([]); setRoutes([]); }} variant="destructive" size="sm" className="shadow-lg">Clear All Waypoints</Button>}
            {drawnPolygon.length > 0 && !isDrawing && <Button onClick={() => setDrawnPolygon([])} variant="destructive" size="sm" className="shadow-lg">Clear Area</Button>}
          </div>

          {isLoadingRoute && <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}
        </main>
      </div>
    </div>
  );
}

export default App;


