import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  Map,
  Edit3,
  RefreshCw,
  Info
} from 'lucide-react';

export interface LocationData {
  locality: string;
  street_or_landmark: string;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m: number | null;
  location_source: 'gps' | 'map_pin' | 'manual';
  location_confirmed: boolean;
}

interface LocationPickerProps {
  value: LocationData;
  onChange: (data: LocationData) => void;
}

type GpsState = 'idle' | 'requesting' | 'success' | 'denied' | 'unavailable' | 'timeout';
type MapMode = 'closed' | 'open';

// Reverse geocode via Nominatim (OpenStreetMap) — free, no API key needed
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'CivicFix-HACK-P423' } }
    );
    if (!res.ok) return '';
    const data = await res.json();
    if (data?.error) return '';
    const addr = data.address || {};
    // Build a readable address from components
    const parts: string[] = [];
    if (addr.road) parts.push(addr.road);
    if (addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city_district) {
      parts.push(addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city_district);
    }
    if (addr.city || addr.county) parts.push(addr.city || addr.county);
    return parts.slice(0, 3).join(', ');
  } catch {
    return '';
  }
}

export const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange }) => {
  const [gpsState, setGpsState] = useState<GpsState>('idle');
  const [gpsError, setGpsError] = useState<string>('');
  const [mapMode, setMapMode] = useState<MapMode>('closed');
  const [isGeocodingMap, setIsGeocodingMap] = useState(false);
  const [geocodedAddress, setGeocodedAddress] = useState<string>('');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const isMapInitialized = useRef(false);

  const hasCoords = value.latitude !== null && value.longitude !== null;
  const isConfirmed = value.location_confirmed && (value.locality.length >= 2 || hasCoords);

  const update = (partial: Partial<LocationData>) => {
    onChange({ ...value, ...partial });
  };

  // GPS capture
  const handleGpsCapture = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsState('unavailable');
      setGpsError('Your browser does not support Geolocation.');
      return;
    }
    setGpsState('requesting');
    setGpsError('');

    const timeoutId = setTimeout(() => {
      setGpsState('timeout');
      setGpsError('Location request timed out. Please try again or enter location manually.');
    }, 15000);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        clearTimeout(timeoutId);
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsState('success');
        // NOTE: GPS gives reporter's CURRENT position, NOT necessarily the grievance location.
        // We present this as a starting point and ask the citizen to confirm/move it.
        update({
          latitude,
          longitude,
          location_accuracy_m: Math.round(accuracy),
          location_source: 'gps',
          location_confirmed: false, // Must still confirm
        });

        // Attempt reverse geocode
        try {
          const addr = await reverseGeocode(latitude, longitude);
          if (addr) {
            setGeocodedAddress(addr);
            if (!value.locality || value.locality.length < 3) {
              update({
                latitude,
                longitude,
                location_accuracy_m: Math.round(accuracy),
                location_source: 'gps',
                location_confirmed: false,
                locality: addr,
              });
            }
          }
        } catch { /* geocode failure is non-fatal */ }
      },
      (err) => {
        clearTimeout(timeoutId);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsState('denied');
          setGpsError('Location permission was denied. Please enable it in your browser settings, or enter the location manually below.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsState('unavailable');
          setGpsError('Location is currently unavailable. This may happen indoors or on desktop. Please enter the location manually.');
        } else {
          setGpsState('timeout');
          setGpsError('Location request timed out. Please try again or enter the location manually.');
        }
      },
      { enableHighAccuracy: true, timeout: 14000, maximumAge: 30000 }
    );
  }, [value]);

  // Initialize Leaflet map
  const initLeafletMap = useCallback(async () => {
    if (isMapInitialized.current || !mapContainerRef.current) return;
    isMapInitialized.current = true;

    try {
      const L = (await import('leaflet')).default;

      // Fix default icon URLs broken by bundlers
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const initialLat = value.latitude ?? 17.3850;
      const initialLon = value.longitude ?? 78.4867;
      const initialZoom = hasCoords ? 16 : 12;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLon],
        zoom: initialZoom,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Add draggable marker
      const marker = L.marker([initialLat, initialLon], { draggable: true }).addTo(map);
      marker.bindPopup('<b>Issue Location</b><br>Drag to the exact spot of the problem.').openPopup();
      markerRef.current = marker;
      leafletMapRef.current = map;

      const onMarkerMove = async (lat: number, lon: number) => {
        setIsGeocodingMap(true);
        update({
          latitude: lat,
          longitude: lon,
          location_source: 'map_pin',
          location_confirmed: false,
          location_accuracy_m: null,
        });

        try {
          const addr = await reverseGeocode(lat, lon);
          if (addr) setGeocodedAddress(addr);
        } catch { /* non-fatal */ }
        setIsGeocodingMap(false);
      };

      // Drag end handler
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onMarkerMove(pos.lat, pos.lng);
      });

      // Click-to-move handler
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        onMarkerMove(e.latlng.lat, e.latlng.lng);
      });
    } catch (err) {
      console.warn('Leaflet map failed to load:', err);
    }
  }, []);

  useEffect(() => {
    if (mapMode === 'open') {
      setTimeout(initLeafletMap, 100); // Let DOM render first
    }
    return () => {
      if (mapMode === 'closed' && leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markerRef.current = null;
        isMapInitialized.current = false;
      }
    };
  }, [mapMode]);

  // Sync marker to external lat/lon changes (e.g. from GPS)
  useEffect(() => {
    if (markerRef.current && value.latitude && value.longitude) {
      markerRef.current.setLatLng([value.latitude, value.longitude]);
      if (leafletMapRef.current) {
        leafletMapRef.current.setView([value.latitude, value.longitude], 16);
      }
    }
  }, [value.latitude, value.longitude]);

  const handleConfirmLocation = () => {
    if (!value.locality || value.locality.length < 2) return;
    update({ location_confirmed: true });
  };

  const handleClearLocation = () => {
    setGpsState('idle');
    setGpsError('');
    setGeocodedAddress('');
    onChange({
      locality: '',
      street_or_landmark: '',
      latitude: null,
      longitude: null,
      location_accuracy_m: null,
      location_source: 'manual',
      location_confirmed: false,
    });
  };

  const gpsButtonLabel = {
    idle: 'Use My Current Location',
    requesting: 'Detecting Location...',
    success: 'GPS Location Captured',
    denied: 'Permission Denied – Try Again',
    unavailable: 'GPS Unavailable',
    timeout: 'Timed Out – Retry',
  }[gpsState];

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
          Issue Location *
        </label>
        {isConfirmed && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Location Confirmed
          </span>
        )}
        {!isConfirmed && (value.locality.length > 0 || hasCoords) && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/60">
            Not Yet Confirmed
          </span>
        )}
      </div>

      {/* GPS + Map buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleGpsCapture}
          disabled={gpsState === 'requesting'}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all min-h-[38px] ${
            gpsState === 'success'
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
              : gpsState === 'denied' || gpsState === 'unavailable' || gpsState === 'timeout'
              ? 'bg-rose-950/60 text-rose-300 border-rose-800/60 hover:bg-rose-900/60'
              : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-cyan-600 hover:text-cyan-300'
          } disabled:opacity-60`}
        >
          {gpsState === 'requesting' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : gpsState === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Navigation className="w-3.5 h-3.5" />
          )}
          {gpsButtonLabel}
        </button>

        <button
          type="button"
          onClick={() => setMapMode(mapMode === 'open' ? 'closed' : 'open')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all min-h-[38px] ${
            mapMode === 'open'
              ? 'bg-blue-950/60 text-blue-300 border-blue-800/60'
              : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-blue-600 hover:text-blue-300'
          }`}
        >
          <Map className="w-3.5 h-3.5" />
          {mapMode === 'open' ? 'Hide Map' : 'Choose on Map'}
        </button>

        {(hasCoords || value.locality) && (
          <button
            type="button"
            onClick={handleClearLocation}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-400 border border-transparent hover:border-rose-900/60 transition-all min-h-[38px]"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* GPS Error message */}
      {gpsError && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
          <span>{gpsError}</span>
        </div>
      )}

      {/* GPS Success info banner */}
      {gpsState === 'success' && hasCoords && (
        <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 text-[11px] text-blue-300 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
          <span>
            <strong>Important:</strong> Your current GPS position has been captured as a starting point. 
            Please verify this is the <em>location of the issue</em>, not just where you are now. 
            Use the map to move the pin to the exact problem spot if needed.
            {value.location_accuracy_m && (
              <span className="block mt-1 text-slate-400">GPS accuracy: ±{value.location_accuracy_m}m</span>
            )}
          </span>
        </div>
      )}

      {/* Leaflet Map */}
      {mapMode === 'open' && (
        <div className="rounded-xl overflow-hidden border border-slate-700 shadow-xl">
          <div className="bg-slate-900/80 px-3 py-2 text-[11px] text-slate-400 flex items-center gap-2 border-b border-slate-700">
            <Map className="w-3.5 h-3.5 text-blue-400" />
            Click on the map or drag the pin to mark the exact issue location.
            {isGeocodingMap && (
              <span className="flex items-center gap-1 text-cyan-400 ml-auto">
                <Loader2 className="w-3 h-3 animate-spin" />
                Looking up address...
              </span>
            )}
          </div>
          {/* Map container — Leaflet mounts here */}
          <div
            ref={mapContainerRef}
            style={{ height: '280px', width: '100%', background: '#1e293b' }}
          />
          {hasCoords && (
            <div className="bg-slate-900/80 px-3 py-2 text-[11px] text-slate-400 font-mono flex items-center gap-3 border-t border-slate-700 flex-wrap">
              <span>Lat: <strong className="text-cyan-400">{value.latitude?.toFixed(6)}</strong></span>
              <span>Lon: <strong className="text-cyan-400">{value.longitude?.toFixed(6)}</strong></span>
              {geocodedAddress && (
                <span className="text-slate-300">→ {geocodedAddress}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Geocoded address suggestion */}
      {geocodedAddress && !value.locality && (
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            Detected: <strong>{geocodedAddress}</strong>
          </div>
          <button
            type="button"
            onClick={() => update({ locality: geocodedAddress })}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 whitespace-nowrap"
          >
            Use This →
          </button>
        </div>
      )}

      {/* Manual location fields */}
      <div className="space-y-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            Locality / Area *
          </label>
          <input
            type="text"
            required
            value={value.locality}
            onChange={(e) => update({ locality: e.target.value, location_confirmed: false })}
            placeholder="e.g. Sector 4, Near Metro Station, Banjara Hills"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            Street / Building / Landmark (Optional but helpful)
          </label>
          <input
            type="text"
            value={value.street_or_landmark}
            onChange={(e) => update({ street_or_landmark: e.target.value })}
            placeholder="e.g. Main Road near HDFC Bank, opposite Gate 3"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Coordinates display */}
      {hasCoords && (
        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700 text-[11px] font-mono text-slate-400 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-cyan-400" />
            {value.latitude?.toFixed(6)}, {value.longitude?.toFixed(6)}
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
            value.location_source === 'gps' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
            value.location_source === 'map_pin' ? 'bg-blue-950 text-blue-400 border border-blue-800' :
            'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            {value.location_source === 'gps' ? 'GPS' : value.location_source === 'map_pin' ? 'Map Pin' : 'Manual'}
          </span>
          {value.location_accuracy_m && (
            <span className="text-slate-500">±{value.location_accuracy_m}m</span>
          )}
        </div>
      )}

      {/* Confirm location button */}
      {(value.locality.length >= 2) && !isConfirmed && (
        <button
          type="button"
          onClick={handleConfirmLocation}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-900/50 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/50 hover:border-emerald-700 transition-all min-h-[40px]"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Confirm This Location
        </button>
      )}
    </div>
  );
};
