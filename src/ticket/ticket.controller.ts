import {
  Controller,
  OnModuleInit,
} from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { TicketService } from './ticket.service';

@Controller()
export class TicketController implements OnModuleInit {
  constructor(private readonly ticketService: TicketService) {}

  onModuleInit() {
    console.log('tickettt');
  }

  // @Post()
  // create(@Body() createTicketDto: CreateTicketDto) {
  //   return this.ticketService.create(createTicketDto);
  // }
  //
  // @Get()
  // findAll() {
  //   return this.ticketService.findAll();
  // }
  //
  @MessagePattern('caaaab')
  // findOne(@Payload() data: { id: string }) {
  findOne() {
    console.log('>');
    return {
      name: 'Ticket',
    };
  }

  //
  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateTicketDto: UpdateTicketDto) {
  //   return this.ticketService.update(+id, updateTicketDto);
  // }
  //
  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.ticketService.remove(+id);
  // }
}
