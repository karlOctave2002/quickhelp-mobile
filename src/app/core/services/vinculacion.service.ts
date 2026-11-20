import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

interface RespuestaCodigo {
    codigoVinculacion: string;
}

@Injectable({ providedIn: 'root' })
export class VinculacionService {
    private readonly http = inject(HttpClient);
    private readonly url =
        'https://quickhelp-backend.onrender.com/api/vinculacion/codigo';

    obtenerCodigo(token: string) {
        return this.http.get<RespuestaCodigo>(this.url, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 60000,
        });
    }
}