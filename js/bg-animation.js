/**
 * Animacion de fondo para la pantalla de acceso.
 * Simula una red de telemetria en movimiento para dar contexto visual.
 */

class TelemetryNetwork {
    // Prepara el lienzo, escucha resize y arranca el ciclo de animacion.
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.numberOfParticles = 80;
        this.maxDistance = 180;
        this.mouse = { x: null, y: null, radius: 150 };

        window.addEventListener('resize', () => this.initCanvas());
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.x;
            this.mouse.y = e.y;
        });

        this.initCanvas();
        this.animate();
    }

    // Ajusta el canvas al viewport y reconstruye las particulas.
    initCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.createParticles();
    }

    // Crea las particulas base que luego se conectan entre si.
    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.numberOfParticles; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2 + 1,
                speedX: (Math.random() - 0.5) * 0.5,
                speedY: (Math.random() - 0.5) * 0.5,
                color: 'rgba(37, 99, 235, 0.4)' // Azul base suave de la marca.
            });
        }
    }

    // Dibuja nodos, los desplaza y crea conexiones cuando quedan cerca.
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = 0; i < this.particles.length; i++) {
            let p = this.particles[i];
            
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();

            // Movimiento base de cada particula.
            p.x += p.speedX;
            p.y += p.speedY;

            // Rebote al tocar los bordes del canvas.
            if (p.x < 0 || p.x > this.canvas.width) p.speedX *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.speedY *= -1;

            // Conexion visual entre particulas cercanas.
            for (let j = i; j < this.particles.length; j++) {
                let p2 = this.particles[j];
                let dx = p.x - p2.x;
                let dy = p.y - p2.y;
                let distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < this.maxDistance) {
                    let opacity = 1 - (distance / this.maxDistance);
                    this.ctx.strokeStyle = `rgba(37, 99, 235, ${opacity * 0.35})`;
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }
    }

    // Mantiene la animacion corriendo mientras la pagina siga abierta.
    animate() {
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// Activa la animacion cuando el DOM de la pagina de acceso ya esta listo.
document.addEventListener('DOMContentLoaded', () => {
    new TelemetryNetwork('telemetry-bg');
});
