import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS as P,
  type BillDto,
  type CheckoutResultDto,
  type PaymentDto,
  type StayExtraDto,
} from '@riad/shared';
import { CurrentUser, RequirePermissions } from '../common/auth/decorators';
import type { AuthPrincipal } from '../common/auth/principal';
import { CheckoutDto, CreateExtraDto, CreatePaymentDto } from './billing.dto';
import { BillingService } from './billing.service';

@ApiTags('billing')
@Controller('stays/:id')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @RequirePermissions(P.STAYS_READ)
  @Get('bill')
  bill(@CurrentUser() p: AuthPrincipal, @Param('id', ParseUUIDPipe) id: string): Promise<BillDto> {
    return this.billing.bill(p, id);
  }

  @RequirePermissions(P.STAYS_WRITE)
  @Post('extras')
  addExtra(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExtraDto,
  ): Promise<StayExtraDto> {
    return this.billing.addExtra(p, id, dto);
  }

  @RequirePermissions(P.STAYS_WRITE)
  @Delete('extras/:extraId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeExtra(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('extraId', ParseUUIDPipe) extraId: string,
  ): Promise<void> {
    return this.billing.removeExtra(p, id, extraId);
  }

  @RequirePermissions(P.PAYMENTS_WRITE)
  @Post('payments')
  addPayment(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentDto> {
    return this.billing.addPayment(p, id, dto);
  }

  @RequirePermissions(P.PAYMENTS_WRITE)
  @Delete('payments/:paymentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePayment(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<void> {
    return this.billing.removePayment(p, id, paymentId);
  }

  /** Checking out issues the invoice, so it needs both stay and payment rights. */
  @RequirePermissions(P.STAYS_WRITE, P.PAYMENTS_WRITE)
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  checkout(
    @CurrentUser() p: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckoutDto,
  ): Promise<CheckoutResultDto> {
    return this.billing.checkout(p, id, dto);
  }
}
