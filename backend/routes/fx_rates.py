from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from models.fx_rates import (
    compute_pair_rate,
    convert_amount,
    get_latest_available_rates,
    get_rates_for_date,
    parse_currency_pair,
    resolve_rates_for_date_with_today_fallback,
)


router = APIRouter(prefix="/fx-rates", tags=["FX Rates"])


class FxRateResponse(BaseModel):
    currency_pair: str
    base_currency: str
    quote_currency: str
    requested_date: str
    resolved_date: str
    used_fallback: bool
    rate: float = Field(description="How many quote currency units equal 1 base currency unit")
    inverse_rate: float = Field(description="How many base currency units equal 1 quote currency unit")
    amount: float
    converted_amount: float


class FxLatestDateResponse(BaseModel):
    latest_date: str


class FxCurrenciesResponse(BaseModel):
    requested_date: str
    resolved_date: str
    used_fallback: bool
    currencies: list[str]


class FxAllRatesResponse(BaseModel):
    requested_date: str
    resolved_date: str
    used_fallback: bool
    rates: dict[str, float] = Field(description="Currency code to exchange rate mapping")


class FxLatestPairRateResponse(BaseModel):
    currency_pair: str
    base_currency: str
    quote_currency: str
    resolved_date: str
    rate: float = Field(description="How many quote currency units equal 1 base currency unit")
    inverse_rate: float = Field(description="How many base currency units equal 1 quote currency unit")


def _parse_date_or_latest(date_value: str | None) -> tuple[date | None, bool, str]:
    """
    Returns:
    - parsed_date: date | None
    - is_latest: bool
    - requested_label: str for response payload
    """

    if date_value is None:
        today = date.today()
        return today, False, today.isoformat()

    normalized = date_value.strip().lower()
    if normalized == "latest":
        return None, True, "latest"

    try:
        parsed = date.fromisoformat(date_value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date. Use YYYY-MM-DD or 'latest'.",
        ) from exc

    if parsed > date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Future dates are not supported for FX rates.",
        )

    return parsed, False, parsed.isoformat()


@router.get("", response_model=FxRateResponse)
def route_get_fx_rate(
    currency_pair: str = Query(alias="currency-pair", description="Currency pair, e.g. MXNEUR or MXN-EUR"),
    date_param: str | None = Query(default=None, alias="date", description="YYYY-MM-DD or 'latest'"),
    amount: float = Query(default=1.0, gt=0, description="Amount in base currency to convert"),
):
    """
    Returns FX conversion and pair rate.

    Rules:
    - date=latest always resolves to latest available date.
    - date=today (or omitted) falls back to latest available date when today's rates are not yet present.
    - explicit past date must exist, otherwise 404.
    - future dates are rejected.
    """

    try:
        base_currency, quote_currency = parse_currency_pair(currency_pair)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    parsed_date, is_latest, requested_label = _parse_date_or_latest(date_param)

    if is_latest:
        latest = get_latest_available_rates(on_or_before=date.today())
        if latest is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No FX rates data is available.",
            )
        resolved_date, rates = latest
        used_fallback = False
    else:
        assert parsed_date is not None
        resolved = resolve_rates_for_date_with_today_fallback(parsed_date)
        if resolved is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No FX rates found for {parsed_date.isoformat()}.",
            )
        resolved_date, rates, used_fallback = resolved

    try:
        rate = compute_pair_rate(
            base_currency=base_currency,
            quote_currency=quote_currency,
            rates=rates,
        )
        converted_amount = convert_amount(
            amount=amount,
            base_currency=base_currency,
            quote_currency=quote_currency,
            rates=rates,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    inverse_rate = 1 / rate if rate != 0 else 0.0

    return FxRateResponse(
        currency_pair=f"{base_currency.upper()}{quote_currency.upper()}",
        base_currency=base_currency.upper(),
        quote_currency=quote_currency.upper(),
        requested_date=requested_label,
        resolved_date=resolved_date.isoformat(),
        used_fallback=used_fallback,
        rate=rate,
        inverse_rate=inverse_rate,
        amount=amount,
        converted_amount=converted_amount,
    )


@router.get("/latest", response_model=FxLatestDateResponse)
def route_get_latest_fx_date():
    """Returns the latest date for which FX rates are available."""

    latest = get_latest_available_rates(on_or_before=date.today())
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No FX rates data is available.",
        )

    latest_date, _ = latest
    return FxLatestDateResponse(latest_date=latest_date.isoformat())


@router.get("/latest/{currency_pair}", response_model=FxLatestPairRateResponse)
def route_get_latest_pair_rate(currency_pair: str):
    """
    Returns latest available conversion rate for a currency pair.

    Example:
    GET /fx-rates/latest/GELMXN
    """

    try:
        base_currency, quote_currency = parse_currency_pair(currency_pair)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    latest = get_latest_available_rates(on_or_before=date.today())
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No FX rates data is available.",
        )

    resolved_date, rates = latest

    try:
        rate = compute_pair_rate(
            base_currency=base_currency,
            quote_currency=quote_currency,
            rates=rates,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    inverse_rate = 1 / rate if rate != 0 else 0.0

    return FxLatestPairRateResponse(
        currency_pair=f"{base_currency.upper()}{quote_currency.upper()}",
        base_currency=base_currency.upper(),
        quote_currency=quote_currency.upper(),
        resolved_date=resolved_date.isoformat(),
        rate=rate,
        inverse_rate=inverse_rate,
    )


@router.get("/currencies", response_model=FxCurrenciesResponse)
def route_get_currencies_for_date(
    date_param: str | None = Query(default=None, alias="date", description="YYYY-MM-DD or 'latest'"),
):
    """
    Returns available currency codes for a date.

    Uses the same date resolution rules as GET /fx-rates.
    """

    parsed_date, is_latest, requested_label = _parse_date_or_latest(date_param)

    if is_latest:
        latest = get_latest_available_rates(on_or_before=date.today())
        if latest is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No FX rates data is available.",
            )
        resolved_date, rates = latest
        used_fallback = False
    else:
        assert parsed_date is not None
        resolved = resolve_rates_for_date_with_today_fallback(parsed_date)
        if resolved is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No FX rates found for {parsed_date.isoformat()}.",
            )
        resolved_date, rates, used_fallback = resolved

    currencies = sorted(code.upper() for code in rates.keys())

    return FxCurrenciesResponse(
        requested_date=requested_label,
        resolved_date=resolved_date.isoformat(),
        used_fallback=used_fallback,
        currencies=currencies,
    )


@router.get("/{target_date}", response_model=FxCurrenciesResponse)
def route_get_currencies_path_date(target_date: date):
    """
    Convenience endpoint:
    GET /fx-rates/{target_date}

    Returns available currencies for that exact date.
    No fallback is applied here.
    """

    if target_date > date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Future dates are not supported for FX rates.",
        )

    rates = get_rates_for_date(target_date)
    if rates is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No FX rates found for {target_date.isoformat()}.",
        )

    currencies = sorted(code.upper() for code in rates.keys())
    return FxCurrenciesResponse(
        requested_date=target_date.isoformat(),
        resolved_date=target_date.isoformat(),
        used_fallback=False,
        currencies=currencies,
    )


@router.get("/all/latest", response_model=FxAllRatesResponse)
def route_get_all_rates_latest():
    """
    Returns all available FX rates for the latest date.
    """

    latest = get_latest_available_rates(on_or_before=date.today())
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No FX rates data is available.",
        )

    resolved_date, rates = latest
    return FxAllRatesResponse(
        requested_date="latest",
        resolved_date=resolved_date.isoformat(),
        used_fallback=False,
        rates={code.upper(): rate for code, rate in rates.items()},
    )


@router.get("/all/{target_date}", response_model=FxAllRatesResponse)
def route_get_all_rates_for_date(target_date: date):
    """
    Returns all available FX rates for a specific date.
    No fallback is applied here.
    """

    if target_date > date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Future dates are not supported for FX rates.",
        )

    rates = get_rates_for_date(target_date)
    if rates is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No FX rates found for {target_date.isoformat()}.",
        )

    return FxAllRatesResponse(
        requested_date=target_date.isoformat(),
        resolved_date=target_date.isoformat(),
        used_fallback=False,
        rates={code.upper(): rate for code, rate in rates.items()},
    )
