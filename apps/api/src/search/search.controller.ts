import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SearchService } from './search.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  query(@Query('q') q: string, @CurrentUser() user: { id: string; role: Role }) {
    return this.search.search(q || '', user);
  }
}
