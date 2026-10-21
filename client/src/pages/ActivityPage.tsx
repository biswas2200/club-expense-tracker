import { api } from '../api';
import { ActivityList } from '../components/ActivityList';
import { useResource } from '../useResource';

/** Everything anyone has recorded, checked or counted, across all events. */
export function ActivityPage() {
  const { data, error } = useResource('activity', () => api.activity());
  return (
    <>
      <div className="page-head page-head-stack">
        <h1>Activity</h1>
        <p className="muted">
          Every entry, correction, check and cash count, newest first. Nothing here can be edited or
          deleted.
        </p>
      </div>
      {error && (
        <p role="alert" className="alert">
          Could not load activity: {error}
        </p>
      )}
      {data && (
        <div className="card-plain">
          <ActivityList items={data} showEvent />
        </div>
      )}
    </>
  );
}
