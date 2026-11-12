import Phaser from 'phaser';
import type { MapSprite } from './renderModel';
import { PAPER, RED_INK } from './palette';
import { SHEET_KEY } from './texture';

export class EntityView {
  readonly root: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Image;
  private readonly outline: Phaser.GameObjects.Image[];
  private readonly label: Phaser.GameObjects.Text;
  private readonly dmOutline: Phaser.GameObjects.Graphics;
  private readonly dmLabel: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, model: MapSprite) {
    this.root = scene.add.container();
    this.outline = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ].map(([x, y]) =>
      scene.add
        .image(x ?? 0, y ?? 0, SHEET_KEY, model.frame)
        .setTint(RED_INK)
        .setTintMode(Phaser.TintModes.FILL),
    );
    this.sprite = scene.add
      .image(0, 0, SHEET_KEY, model.frame)
      .setInteractive({ useHandCursor: true });
    this.sprite.on('pointerdown', () =>
      scene.events.emit('entity-clicked', { id: model.id }),
    );
    this.label = scene.add
      .text(0, -11, model.label, {
        fontFamily: '"Pixelify Sans", monospace',
        fontSize: '10px',
        color: '#9b1c1c',
        backgroundColor: PAPER,
        padding: { x: 2, y: 1 },
      })
      .setOrigin(0.5, 1);
    this.marker = scene.add
      .graphics()
      .fillStyle(RED_INK)
      .fillPoints(
        [
          new Phaser.Math.Vector2(7, -10),
          new Phaser.Math.Vector2(9, -8),
          new Phaser.Math.Vector2(7, -6),
          new Phaser.Math.Vector2(5, -8),
        ],
        true,
      );
    this.dmOutline = scene.add.graphics().lineStyle(1, 0xd4af37);
    for (let offset = -9; offset < 9; offset += 5) {
      this.dmOutline.lineBetween(offset, -9, offset + 3, -9);
      this.dmOutline.lineBetween(offset, 9, offset + 3, 9);
      this.dmOutline.lineBetween(-9, offset, -9, offset + 3);
      this.dmOutline.lineBetween(9, offset, 9, offset + 3);
    }
    this.dmLabel = scene.add
      .text(0, 10, '', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#825320',
        backgroundColor: PAPER,
      })
      .setOrigin(0.5, 0);
    this.root.add([this.dmOutline, this.dmLabel]);
    this.root.add([...this.outline, this.sprite, this.marker, this.label]);
    this.refresh(model);
  }

  refresh(model: MapSprite) {
    this.sprite.setFrame(model.frame);
    this.dmOutline.setVisible(!!model.dmNote);
    this.dmLabel.setText(model.dmNote ?? '').setVisible(!!model.dmNote);
    if (model.dmOnly) this.sprite.disableInteractive();
    else this.sprite.setInteractive({ useHandCursor: true });
    if (model.tint === null)
      this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    else this.sprite.setTint(model.tint).setTintMode(Phaser.TintModes.FILL);
    for (const image of this.outline)
      image.setFrame(model.frame).setVisible(model.selected);
    this.label.setText(model.label).setVisible(model.selected);
    this.marker.setVisible(model.changed);
    this.root.setDepth(model.selected ? 2 : 1);
  }

  pose(x: number, y: number, flipX: boolean) {
    this.root.setPosition(x, y);
    this.sprite.setFlipX(flipX);
    for (const image of this.outline) image.setFlipX(flipX);
  }
}
