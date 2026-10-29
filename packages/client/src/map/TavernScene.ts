import Phaser from 'phaser';
import type { EntityId } from '@dungeon/shared';
import { sheetUrl, tavernMap } from './assets';
import type { MapScenePort } from './bridge';
import { EntityView } from './EntityView';
import { integerFit } from './fit';
import { TILE_SIZE } from './mapData';
import { sampleCue, sampleMoves } from './motion';
import type { RenderModel } from './renderModel';
import { registerSheet, SHEET_KEY } from './texture';

export class TavernScene extends Phaser.Scene implements MapScenePort {
  private model: RenderModel | null = null;
  private stage: Phaser.GameObjects.Container | null = null;
  private readonly views = new Map<EntityId, EntityView>();
  private readonly listeners = new Set<(event: { id: EntityId }) => void>();
  private moveKey = '';
  private moveStarted = 0;
  private readonly cueStarts = new Map<string, number>();

  constructor() {
    super('Tavern');
  }

  preload() {
    this.load.image('kenney-source', sheetUrl);
  }

  create() {
    const source = this.textures.get('kenney-source').getSourceImage();
    if (!(source instanceof HTMLImageElement))
      throw new Error('Missing Kenney sprite sheet.');
    registerSheet(this, source).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.stage = this.add.container();
    for (const tile of this.model?.tiles ?? tavernMap.tiles)
      this.stage.add(
        this.add
          .image(tile.x * TILE_SIZE, tile.y * TILE_SIZE, SHEET_KEY, tile.frame)
          .setOrigin(0),
      );
    this.cameras.main.setRoundPixels(true);
    this.events.on('entity-clicked', (event: { id: EntityId }) => {
      for (const listener of this.listeners) listener(event);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit, this);
      this.listeners.clear();
    });
    this.fit();
    this.drawModel();
  }

  on(_event: 'entity-clicked', listener: (event: { id: EntityId }) => void) {
    this.listeners.add(listener);
  }
  off(_event: 'entity-clicked', listener: (event: { id: EntityId }) => void) {
    this.listeners.delete(listener);
  }
  setModel(model: RenderModel) {
    this.model = model;
    this.drawModel();
  }

  private fit = () => {
    const fit = integerFit(
      this.scale.width,
      this.scale.height,
      tavernMap.width * TILE_SIZE,
      tavernMap.height * TILE_SIZE,
    );
    this.stage?.setPosition(fit.x, fit.y).setScale(fit.scale);
  };

  private drawModel() {
    if (!this.stage || !this.model) return;
    const model = this.model;
    const visible = new Set(model.sprites.map(({ id }) => id));
    for (const [id, view] of this.views) {
      if (visible.has(id)) continue;
      view.root.destroy();
      this.views.delete(id);
    }
    for (const sprite of model.sprites) {
      let view = this.views.get(sprite.id);
      if (!view) {
        view = new EntityView(this, sprite);
        this.stage.add(view.root);
        this.views.set(sprite.id, view);
      }
      view.refresh(sprite);
    }
    this.stage.sort('depth');
    const key = model.tweens
      .map((move) => `${move.key}:${move.durationMs}`)
      .join(',');
    if (key !== this.moveKey) {
      this.moveKey = key;
      this.moveStarted = this.time.now;
    }
    const cueKeys = new Set(model.cues.map(({ key }) => key));
    for (const key of this.cueStarts.keys())
      if (!cueKeys.has(key)) this.cueStarts.delete(key);
    for (const cue of model.cues)
      if (!this.cueStarts.has(cue.key))
        this.cueStarts.set(cue.key, this.time.now);
    this.update();
  }

  update() {
    if (!this.stage || !this.model) return;
    const elapsed = this.time.now - this.moveStarted;
    const end = this.model.tweens.at(-1);
    const moves =
      end && elapsed <= end.startMs + end.durationMs
        ? sampleMoves(this.model.tweens, elapsed)
        : new Map<EntityId, { x: number; y: number }>();
    const cues = new Map<EntityId, { y: number; flipX: boolean }>();
    for (const cue of this.model.cues)
      cues.set(
        cue.id,
        sampleCue(cue, this.time.now - (this.cueStarts.get(cue.key) ?? 0)),
      );
    for (const sprite of this.model.sprites) {
      const point = moves.get(sprite.id) ?? sprite;
      const cue = cues.get(sprite.id);
      this.views
        .get(sprite.id)
        ?.pose(
          Math.round(point.x * TILE_SIZE) + TILE_SIZE / 2,
          Math.round(point.y * TILE_SIZE) + TILE_SIZE / 2 + (cue?.y ?? 0),
          cue?.flipX ?? false,
        );
    }
  }
}
