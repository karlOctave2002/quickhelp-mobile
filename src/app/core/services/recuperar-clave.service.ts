import { HttpClient } from '@angular/common/http'; // Llama a las rutas públicas de recuperación.
import { Injectable, inject } from '@angular/core';
import { timeout } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RecuperarClaveService {
    private readonly http = inject(HttpClient);
    private readonly url = 'https://quickhelp-backend.onrender.com/api/auth/recuperar-clave';

    // Envía un código de 6 dígitos al correo (si la cuenta existe).
    solicitarCodigo(correo: string) {
        return this.http.post<{ mensaje: string }>(`${this.url}/solicitar`, { correo }).pipe(
            timeout(60000) // Render puede tardar en despertar.
        );
    }

    // Cambia la contraseña con el código recibido.
    cambiarClave(correo: string, codigo: string, nuevaClave: string) {
        return this.http.post<void>(`${this.url}/cambiar`, { correo, codigo, nuevaClave }).pipe(
            timeout(60000)
        );
    }
}
