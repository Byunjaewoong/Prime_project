'use client';
import { useEffect } from 'react';
import { App } from '../lib/App';

export default function CanvasApp() {
    useEffect(() => {
        const app = new App();
        return () => {
            document.body.removeChild(app.canvas);
        };
    }, []);

    return null;
}
