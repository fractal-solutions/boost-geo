import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Menu,
  Paperclip,
  Search,
  Send,
  Smile,
  MessageCircle,
  Users,
  Map as MapIcon,
  Settings,
  Plus,
  MapPin,
  Flag,
  X,
} from "lucide-react";
import React, { useState, useRef, useEffect, useCallback } from "react";
import "./index.css";

// --- MOCK DATA ---
const currentUser = {
  name: "Fractal",
  avatar: "https://github.com/shadcn.png",
};
const friends = [
  { id: 1, name: "Alice", avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704d", status: "online", lastMessage: "See you on the map!", unread: 2, location: { longitude: -122.41, latitude: 37.78 } },
  { id: 2, name: "Bob", avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704e", status: "offline", lastMessage: "Let's catch up later.", unread: 0, location: { longitude: -122.42, latitude: 37.79 } },
];
const messages = [
  { id: 1, sender: "Alice", text: "Hey! Are you there?", time: "10:30 AM" },
  { id: 2, sender: "Fractal", text: "Hey Alice! I'm here. What's up?", time: "10:31 AM" },
];
// --- END MOCK DATA ---


/**
 * Fetches a route between waypoints from the OSRM public API.
 * @param waypoints An array of [longitude, latitude] coordinates.
 * @returns A promise that resolves to an array of coordinates for the route path.
 */
async function fetchRoute(waypoints: [number, number][]): Promise<[number, number][]> {
  if (waypoints.length < 2) {
    return [];
  }

  const coordinatesString = waypoints.map(p => p.join(',')).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesString}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      // OSRM returns coordinates in [longitude, latitude] format, which is what MapRoute expects.
      const routeGeometry = data.routes[0].geometry.coordinates;
      return routeGeometry;
    } else {
      console.warn("No route found by OSRM.");
      return []; // No route found
    }
  } catch (error) {
    console.error("Failed to fetch route from OSRM:", error);
    // Fallback to a straight line in case of an API error
    return waypoints;
  }
}


// --- UI COMPONENTS ---
const FriendList = ({ onToggle }: { onToggle: () => void }) => (
  <>
    <div className="p-4 flex items-center justify-between border-b border-border flex-shrink-0">
      <div className="flex items-center gap-3">
        <Avatar src={currentUser.avatar} fallback={currentUser.name} />
        <h2 className="font-semibold">{currentUser.name}</h2>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onToggle} className="md:hidden">
        <X className="size-5" />
      </Button>
    </div>
    <div className="p-4 border-b border-border flex-shrink-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground size-4" />
        <Input placeholder="Search friends or chats" className="pl-9" />
      </div>
    </div>
    <ScrollArea className="flex-1">
      <div className="p-2">
        {friends.map((friend) => (
          <div key={friend.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors">
            <div className="relative">
              <Avatar src={friend.avatar} fallback={friend.name} />
              <span className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ${friend.status === "online" ? "bg-green-500" : "bg-gray-500"} ring-2 ring-card`} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm">{friend.name}</h3>
              <p className="text-xs text-muted-foreground truncate">{friend.lastMessage}</p>
            </div>
            {friend.unread > 0 && <div className="bg-primary text-primary-foreground text-xs rounded-full size-5 flex items-center justify-center font-semibold">{friend.unread}</div>}
          </div>
        ))}
      </div>
    </ScrollArea>
  </>
);

/**
 * A controller component that handles map interactions like clicks.
 * It must be a child of the <Map> component.
 */
const MapInteractionController = ({ onMapClick }: { onMapClick: (e: maplibregl.MapMouseEvent) => void }) => {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (isLoaded && map) {
      map.on('click', onMapClick);
      return () => {
        map.off('click', onMapClick);
      };
    }
  }, [map, isLoaded, onMapClick]);

  return null; // This component does not render anything
};


// --- MAIN APP COMPONENT ---
export function App() {
  const [blips, setBlips] = useState([
    { id: 1, longitude: -122.45, latitude: 37.77, text: "Cool graffiti" },
  ]);
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [selection, setSelection] = useState<{ lng: number; lat: number } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleMapClick = useCallback((e: maplibregl.MapMouseEvent) => {
    const target = e.originalEvent.target as HTMLElement;
    // Ignore clicks if they are on a marker's child element
    if (target.closest('.maplibregl-marker')) {
      return;
    }
    setSelection(e.lngLat);
  }, []);

  const addBlip = useCallback(() => {
    if (!selection) return;
    const newBlip = { id: Date.now(), longitude: selection.lng, latitude: selection.lat, text: `Blip #${blips.length + 1}` };
    setBlips(prev => [...prev, newBlip]);
    setSelection(null);
  }, [selection, blips.length]);

  const addWaypoint = useCallback(() => {
    if (!selection) return;
    setWaypoints(prev => [...prev, [selection.lng, selection.lat]]);
    setSelection(null);
  }, [selection]);

  useEffect(() => {
    if (waypoints.length < 2) {
      setRoute([]);
      return;
    }
    let isMounted = true;
    fetchRoute(waypoints).then(routeCords => {
      if (isMounted) setRoute(routeCords);
    });
    return () => { isMounted = false; };
  }, [waypoints]);

  return (
    <div className="h-screen w-screen bg-background text-foreground font-sans antialiased overflow-hidden">
      <div className="flex h-full w-full">
        {/* Sidebar */}
        <aside className={`
          ${isSidebarOpen ? "flex" : "hidden"} md:flex flex-col
          absolute md:relative z-30 w-80 h-full bg-card/95 backdrop-blur-sm border-r border-border transition-transform
        `}>
          <FriendList onToggle={() => setIsSidebarOpen(false)} />
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col relative">
          {/* Mobile Header */}
          <header className="md:hidden p-2 flex items-center justify-between absolute top-0 left-0 right-0 z-20 bg-background/50 backdrop-blur-sm">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}><Menu /></Button>
            <h1 className="font-semibold text-lg">GeoChat</h1>
            <Avatar src={currentUser.avatar} fallback="F" size="sm" />
          </header>

          {/* Map View */}
          <div className="flex-1 relative" style={{ cursor: 'crosshair' }}>
            <Map initialViewState={{ longitude: -122.4, latitude: 37.79, zoom: 13 }}>
              <MapInteractionController onMapClick={handleMapClick} />
              <MapControls position="top-right" showZoom showCompass />
              
              {friends.map(friend => (
                <MapMarker key={`friend-${friend.id}`} longitude={friend.location.longitude} latitude={friend.location.latitude}>
                  <MarkerContent><Avatar src={friend.avatar} fallback={friend.name.charAt(0)} size="sm" /></MarkerContent>
                  <MarkerTooltip>{friend.name}</MarkerTooltip>
                </MapMarker>
              ))}

              {blips.map(blip => (
                <MapMarker key={`blip-${blip.id}`} longitude={blip.longitude} latitude={blip.latitude}>
                  <MarkerContent><MapPin className="text-red-500 size-8" /></MarkerContent>
                  <MarkerTooltip>{blip.text}</MarkerTooltip>
                </MapMarker>
              ))}

              {waypoints.map((wp, i) => (
                 <MapMarker key={`waypoint-${i}`} longitude={wp[0]} latitude={wp[1]}>
                  <MarkerContent>
                    <div className="bg-background rounded-full p-1 shadow-md flex items-center justify-center size-6">
                      <span className="text-xs font-bold">{i + 1}</span>
                    </div>
                  </MarkerContent>
                </MapMarker>
              ))}

              {route.length > 1 && <MapRoute coordinates={route} color="#2563eb" width={4} />}

              {selection && (
                <MapPopup longitude={selection.lng} latitude={selection.lat} onClose={() => setSelection(null)} closeButton>
                  <div className="flex flex-col gap-2">
                    <h3 className="font-semibold text-center">Add to map</h3>
                    <Button onClick={addBlip} size="sm"><MapPin className="size-4 mr-2" /> Add Blip</Button>
                    <Button onClick={addWaypoint} size="sm"><Flag className="size-4 mr-2" /> Add Waypoint</Button>
                  </div>
                </MapPopup>
              )}
            </Map>
          </div>

          {waypoints.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 md:top-auto md:bottom-4">
              <Button onClick={() => { setWaypoints([]); setRoute([]); }} variant="destructive" size="sm" className="shadow-lg">
                Clear Route
              </Button>
            </div>
          )}

          {/* Mobile Bottom Nav */}
          <footer className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border p-2 flex justify-around items-center z-20">
            <Button variant="ghost" className="flex flex-col h-auto p-1 gap-1"><MessageCircle className="size-5" /><span className="text-xs">Chats</span></Button>
            <Button variant="ghost" className="flex flex-col h-auto p-1 gap-1 text-primary"><MapIcon className="size-5" /><span className="text-xs">Map</span></Button>
            <Button variant="ghost" className="flex flex-col h-auto p-1 gap-1"><Users className="size-5" /><span className="text-xs">Friends</span></Button>
            <Button variant="ghost" className="flex flex-col h-auto p-1 gap-1"><Settings className="size-5" /><span className="text-xs">Settings</span></Button>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;
