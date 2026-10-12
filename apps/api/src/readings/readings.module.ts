import { Module } from '@nestjs/common';
import { ReadingsController } from './readings.controller.js';
import { RecordReadingsService } from './record-readings.service.js';

@Module({ controllers: [ReadingsController], providers: [RecordReadingsService] })
export class ReadingsModule {}
