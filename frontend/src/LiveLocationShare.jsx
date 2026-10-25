import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Radio, Share2, ShieldCheck, MapPinned, ExternalLink } from 'lucide-react';
import { supabase } from './lib/supabase';
import './LocationSharing.css';

export function LiveLocationShare({ user }) {
  const [active, setActive] = useState(null);
  const [notice, setNotice] = useState('');
  const watchRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => () => {
    if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
    const current = activeRef.current;
    if (current && supabase && user?.id) {
      // Best-effort server revocation when the sharing panel is unmounted or the user navigates away.
      supabase.from('location_shares').update({ active: false })
        .eq('share_token', current.token).eq('owner_id', user.id).then(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    if (!active) return undefined;
    const remaining = new Date(active.expiresAt).getTime() - Date.now();
    if (remaining <= 0) {
      if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      activeRef.current = null;
      setActive(null);
      setNotice('The one-hour location link expired. Start a new share if needed.');
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
      await supabase?.from('location_shares').update({ active: false })
        .eq('share_token', active.token).eq('owner_id', user.id);
      activeRef.current = null;
      setActive(null);
      setNotice('The one-hour location link expired.');
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [active, user?.id]);

  async function start() {
    if (!supabase || !user) { setNotice('Sign in and configure Supabase first.'); return; }
    if (!navigator.geolocation) { setNotice('This browser does not support GPS.'); return; }
    setNotice('Getting your current GPS location…');
    navigator.geolocation.getCurrentPosition(async position => {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from('location_shares').insert({
        owner_id: user.id,
        share_token: token,
        person_name: user.email?.split('@')[0] || 'Family member',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_m: position.coords.accuracy,
        active: true,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      });
      if (error) { setNotice('Could not start sharing. Run supabase/migrations/202610250001_location_sharing.sql in your Supabase SQL Editor first.'); return; }
      const share = { token, expiresAt };
      activeRef.current = share;
      setActive(share);
      setNotice('Live sharing is on. Send the link only to the person you choose. It expires in one hour.');
      watchRef.current = navigator.geolocation.watchPosition(async next => {
        const { error: updateError } = await supabase.from('location_shares').update({
          latitude: next.coords.latitude,
          longitude: next.coords.longitude,
          accuracy_m: next.coords.accuracy,
          updated_at: new Date().toISOString()
        }).eq('share_token', token).eq('owner_id', user.id).eq('active', true);
        if (updateError) setNotice('Could not update GPS. Check your connection.');
      }, () => setNotice('GPS updates paused. Check location permission and signal.'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    }, error => setNotice(error.code === 1 ? 'Location permission denied. Enable precise location access.' : 'Could not get GPS. Check your phone location settings.'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async function share() {
    if (!active) return;
    const url = window.location.origin + window.location.pathname + '?share=' + encodeURIComponent(active.token);
    try {
      if (navigator.share) await navigator.share({ title: 'Find My Family — live location', text: 'I am sharing my live location with you. This link expires in one hour.', url });
      else { await navigator.clipboard.writeText(url); setNotice('Share link copied. Send it to your chosen recipient.'); }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(url); setNotice('Share link copied. Send it to your chosen recipient.'); }
        catch { setNotice('Sharing was unavailable. Try your browser share menu.'); }
      }
    }
  }

  async function stop() {
    if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    if (active && supabase && user) {
      const { error } = await supabase.from('location_shares').update({ active: false }).eq('share_token', active.token).eq('owner_id', user.id);
      if (error) { setNotice('Could not stop the share on the server. Try again online.'); return; }
    }
    activeRef.current = null;
    setActive(null);
    setNotice('Live location sharing stopped.');
  }

  return <section className="live-share-panel">
    <div className="live-share-copy">
      <span className="hero-chip"><Radio size={13} /> LOCATION SHARING</span>
      <h2>{active ? 'Your live location is sharing' : 'Share your live location'}</h2>
      <p>{active ? 'Only people you send the private link to can view it. The link expires after one hour.' : 'Start GPS updates and send a private, expiring link to a person you choose.'}</p>
    </div>
    <div className="live-share-actions">
      {active ? <><button className="primary-button" onClick={share}><Share2 size={17} />Share link</button><button className="cancel-button" onClick={stop}>Stop sharing</button></> : <button className="primary-button" onClick={start}><LocateFixed size={17} />Start live sharing</button>}
    </div>
    {active && <p className="share-expiry">Expires: {new Date(active.expiresAt).toLocaleTimeString()}</p>}
    {notice && <p className="live-share-notice" role="status">{notice}</p>}
  </section>;
}

export function SharedLocationPage({ token }) {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!supabase) { setError('The sharing service is not configured.'); setLoading(false); return; }
      const { data, error: rpcError } = await supabase.rpc('get_shared_location', { p_token: token });
      if (!alive) return;
      if (rpcError) setError('Could not open this link. The location-sharing database setup may not be complete.');
      else if (data?.length) { setLocation(data[0]); setError(''); }
      else { setLocation(null); setError('This location link has expired or the owner stopped sharing.'); }
      setLoading(false);
    }
    load();
    const timer = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [token]);

  const mapsUrl = location ? 'https://www.google.com/maps?q=' + location.latitude + ',' + location.longitude : '';
  return <main className="shared-location-page"><section className="shared-location-card">
    <div className="brand-lockup"><div className="brand-mark"><MapPinned size={24} /></div><div><div className="brand-name">Find My Family</div><div className="brand-caption">Private location sharing</div></div></div>
    <div className="welcome-icon"><MapPinned size={24} /></div><h1>Shared live location</h1>
    {loading ? <p className="subtitle">Opening secure location link…</p> : error ? <p className="auth-message" role="status">{error}</p> : location ? <>
      <p className="subtitle">Location shared by <strong>{location.person_name}</strong></p>
      <div className="shared-coordinates"><MapPinned size={22} /><div><strong>{Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)}</strong><span>{location.accuracy_m ? 'GPS accuracy about ' + Math.round(location.accuracy_m) + ' m · ' : ''}Updated {new Date(location.updated_at).toLocaleTimeString()}</span></div></div>
      <a className="submit-button shared-map-button" href={mapsUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} />Open in Google Maps</a>
      <p className="privacy-note"><ShieldCheck size={15} /><span>This link is a private bearer link. Anyone with it can view the location until it expires or sharing stops.</span></p>
    </> : null}
  </section></main>;
}
