'use client';

import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/components/AuthProvider';

export default function GuidePage() {
  const { label } = useAuth();
  return (
    <>
      <PageHeader title={label('guide')} subtitle={label('gd_subtitle')} />
      <div className="panel">
        <h2>{label('gd_pathA')}</h2>
        <ol>
          <li>{label('gd_a1')}</li>
          <li>{label('gd_a2')}</li>
          <li>{label('gd_a3')}</li>
          <li>{label('gd_a4')}</li>
          <li>{label('gd_a5')}</li>
          <li>{label('gd_a6')}</li>
        </ol>
      </div>
      <div className="panel">
        <h2>{label('gd_pathB')}</h2>
        <ol>
          <li>{label('gd_b1')}</li>
          <li>{label('gd_b2')}</li>
          <li>{label('gd_b3')}</li>
          <li>{label('gd_b4')}</li>
          <li>{label('gd_b5')}</li>
        </ol>
      </div>
      <div className="panel">
        <h2>{label('gd_habits')}</h2>
        <ul>
          <li>
            <strong>{label('gd_h1t')}</strong> {label('gd_h1d')}
          </li>
          <li>
            <strong>{label('gd_h2t')}</strong> {label('gd_h2d')}
          </li>
          <li>
            <strong>{label('gd_h3t')}</strong> {label('gd_h3d')}
          </li>
          <li>
            <strong>{label('gd_h4t')}</strong> {label('gd_h4d')}
          </li>
          <li>
            <strong>{label('gd_h5t')}</strong> {label('gd_h5d')}
          </li>
          <li>
            {label('gd_mfaPre')} <code dir="ltr">PILOT_MODE=true</code> {label('gd_mfaPost')}
          </li>
        </ul>
      </div>
      <div className="panel">
        <h2>{label('gd_seed')}</h2>
        <p className="muted">
          {label('gd_seedPw')} <code dir="ltr">ChangeMe!Office1</code> {label('gd_seedOr')}{' '}
          <code dir="ltr">SEED_PASSWORD</code>
          {label('gd_seedClose')} {label('gd_seedUsers')}
        </p>
      </div>
    </>
  );
}
