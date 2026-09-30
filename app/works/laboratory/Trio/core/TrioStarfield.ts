export class TrioStarfield {
  private canvas = document.createElement("canvas");
  private context = this.canvas.getContext("2d", { alpha: false });
  private width = 0;
  private height = 0;
  private ratio = 0;

  draw(target: CanvasRenderingContext2D, width: number, height: number, ratio: number) {
    if (width !== this.width || height !== this.height || ratio !== this.ratio) {
      this.width = width;
      this.height = height;
      this.ratio = ratio;
      this.render();
    }
    target.drawImage(this.canvas, 0, 0, width, height);
  }

  private render() {
    const context = this.context;
    if (!context) return;
    this.canvas.width = Math.max(1, Math.round(this.width * this.ratio));
    this.canvas.height = Math.max(1, Math.round(this.height * this.ratio));
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.fillStyle = "#000";
    context.fillRect(0, 0, this.width, this.height);

    // Geo-centr and Helio-centr use 0.002 stars per CSS pixel, with
    // grayscale brightness and radii below one CSS pixel.
    const count = Math.round(this.width * this.height * 0.002);
    for (let index = 0; index < count; index += 1) {
      const lux = Math.floor(Math.random() * 255);
      context.fillStyle = `rgb(${lux},${lux},${lux})`;
      context.beginPath();
      context.arc(Math.random() * this.width, Math.random() * this.height, Math.random(), 0, Math.PI * 2);
      context.fill();
    }
  }
}
